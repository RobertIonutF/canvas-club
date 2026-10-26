import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const mode = process.argv[2];
function runInternal(name,args){
  const result=spawnSync(process.execPath,[resolve("node_modules/convex/bin/main.js"),"run",name,JSON.stringify(args)],{encoding:"utf8",env:process.env});
  if(result.status!==0){process.stderr.write(result.stderr??"Internal QA check failed.");process.exit(result.status??1);}
  return JSON.parse(result.stdout.trim());
}
if(mode==="cleanup-email"){
  const email=process.argv[3];if(!/^canvas-qa-[a-f0-9]+-[01]@example\.invalid$/.test(email??""))throw new Error("Explicit QA email required.");
  const found=runInternal("testing:findQa",{email});
  const output=found.userId?runInternal("testing:cleanup",{userIds:[found.userId]}):{usersRemoved:0,rowsRemoved:0,storageDeleted:0};
  await writeFile(".frontend-craft/ui-qa-cleanup.json",JSON.stringify({createdAt:new Date().toISOString(),qaUserId:found.userId,cleanupComplete:true,...output},null,2));
  console.log(JSON.stringify({mode,...output}));process.exit(0);
}
if (!["quota", "cleanup"].includes(mode))
  throw new Error("Choose quota, cleanup, or cleanup-email.");
const path = process.argv[3] ?? ".frontend-craft/backend-smoke-results.json";
const report = JSON.parse(await readFile(path, "utf8"));
const ids = report.cleanup.userIds;
const args =
  mode === "quota"
    ? {
        userId: ids[0],
        otherUserId: ids[1],
        projectId: report.cleanup.projectIds[0],
      }
    : {
        userIds: ids,
        orphanStorageIds: report.cleanup.uploadedStorageIds ?? [],
      };
const result = spawnSync(
  process.execPath,
  [
    resolve("node_modules/convex/bin/main.js"),
    "run",
    mode === "quota" ? "testing:exerciseQuota" : "testing:cleanup",
    JSON.stringify(args),
  ],
  { encoding: "utf8", env: process.env },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "Internal QA check failed.");
  process.exit(result.status ?? 1);
}
const output = JSON.parse(result.stdout.trim());
report[mode === "quota" ? "quotaVerification" : "cleanupResult"] = output;
if (mode === "cleanup") report.cleanup.required = false;
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode, ...output }));

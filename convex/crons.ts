import { anyApi, cronJobs } from "convex/server";

const crons = cronJobs();
// Prompt IDs, weekly progress and quota displays all react to this one row.
crons.daily(
  "advance UTC calendar",
  { hourUTC: 0, minuteUTC: 0 },
  anyApi.calendar.rollover,
  {},
);
export default crons;

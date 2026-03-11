import { getAllTasks } from "../dist/db.js";
import { writeTasksSnapshot } from "../dist/container-runner.js";
const tasks = getAllTasks();
console.log(`${tasks.length} tasks from DB`);
writeTasksSnapshot("main", true, tasks.map(t => ({
  id: t.id, groupFolder: t.group_folder, prompt: t.prompt,
  schedule_type: t.schedule_type, schedule_value: t.schedule_value,
  status: t.status, next_run: t.next_run, protected: t.protected
})));
console.log("Snapshot written");

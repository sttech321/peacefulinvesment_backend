import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { sendSMS } from "./smsService.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const today = dayjs().format("YYYY-MM-DD");
  const { data: tasks, error } = await supabase
    .from("prayer_user_tasks")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", today)
    .gte("end_date", today);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }
   //console.log(tasks);
  for (const task of tasks) {
    //const userNow = dayjs().tz(task.timezone);

    const prayerDateTime = dayjs
      .tz(
        `${today} ${task.prayer_time}`,
        "YYYY-MM-DD HH:mm:ss",
        task.timezone
      )
      .utc();

    const alreadySent =
      task.last_sent_at &&
      dayjs(task.last_sent_at).isSame(prayerDateTime, "minute");

    if (alreadySent) continue;

    const diffMinutes = Math.abs(
      dayjs().utc().diff(prayerDateTime, "minute")
    );

    if (diffMinutes <= 1) {
      try {
        await sendSMS(
          task.phone_number,
          `Prayer reminder for ${task.name}`
        );

        await supabase
          .from("prayer_user_tasks")
          .update({
            last_sent_at: prayerDateTime.toISOString(),
            current_day: task.current_day + 1,
            is_active:
              task.start_date === task.end_date
                ? false
                : task.is_active,
          })
          .eq("id", task.id);

        console.log("Prayer SMS sent:", task.phone_number);
      } catch (err) {
        console.error("SMS failed:", err.message);
      }
    }
  }
}

run();
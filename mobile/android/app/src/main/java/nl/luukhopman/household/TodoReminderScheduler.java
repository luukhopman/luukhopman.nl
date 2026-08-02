package nl.luukhopman.household;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public final class TodoReminderScheduler {
    static final String ACTION_TODO_REMINDER = "nl.luukhopman.household.TODO_REMINDER";
    static final String EXTRA_TODO_ID = "todo_id";
    static final String EXTRA_TODO_TITLE = "todo_title";
    static final String CHANNEL_ID = "todo_reminders";

    private static final String PREFERENCES = "todo_reminders";
    private static final String PENDING_PAYLOAD = "pending_payload";
    private static final String SCHEDULED_IDS = "scheduled_ids";
    private static final String NOTIFICATION_PERMISSION = Manifest.permission.POST_NOTIFICATIONS;

    private final Context context;
    private final AlarmManager alarmManager;
    private final SharedPreferences preferences;

    public TodoReminderScheduler(Context sourceContext) {
        context = sourceContext.getApplicationContext();
        alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        ensureNotificationChannel();
    }

    public boolean areNotificationsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(NOTIFICATION_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    public void requestPermission(Activity activity) {
        ensureNotificationChannel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && activity.checkSelfPermission(NOTIFICATION_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            activity.requestPermissions(new String[]{NOTIFICATION_PERMISSION}, 4101);
            return;
        }
        rescheduleSaved();
    }

    public synchronized void sync(String payload) {
        String safePayload = payload == null ? "[]" : payload;
        preferences.edit().putString(PENDING_PAYLOAD, safePayload).apply();
        if (areNotificationsEnabled()) {
            schedulePayload(safePayload);
        } else {
            cancelScheduledAlarms();
        }
    }

    public synchronized void rescheduleSaved() {
        String payload = preferences.getString(PENDING_PAYLOAD, "[]");
        if (areNotificationsEnabled()) {
            schedulePayload(payload);
        }
    }

    private void schedulePayload(String payload) {
        cancelScheduledAlarms();
        Set<String> scheduledIds = new HashSet<>();
        long now = System.currentTimeMillis();

        try {
            JSONArray reminders = new JSONArray(payload);
            for (int index = 0; index < reminders.length(); index++) {
                JSONObject reminder = reminders.optJSONObject(index);
                if (reminder == null) continue;

                String id = reminder.optString("id", "");
                String title = reminder.optString("title", "Todo reminder");
                long triggerAtMs = reminder.optLong("triggerAtMs", 0L);
                if (id.isEmpty() || triggerAtMs <= now) continue;

                scheduleAlarm(id, title, triggerAtMs);
                scheduledIds.add(id);
            }
        } catch (Exception ignored) {
            // Invalid web payloads should not break the Android shell.
        }

        preferences.edit().putStringSet(SCHEDULED_IDS, scheduledIds).apply();
    }

    private void scheduleAlarm(String id, String title, long triggerAtMs) {
        if (alarmManager == null) return;

        Intent intent = new Intent(context, TodoReminderReceiver.class)
                .setAction(ACTION_TODO_REMINDER)
                .putExtra(EXTRA_TODO_ID, id)
                .putExtra(EXTRA_TODO_TITLE, title);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode(id),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
        } else {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pendingIntent);
        }
    }

    private void cancelScheduledAlarms() {
        if (alarmManager == null) return;

        Set<String> ids = preferences.getStringSet(SCHEDULED_IDS, Collections.emptySet());
        for (String id : ids) {
            Intent intent = new Intent(context, TodoReminderReceiver.class)
                    .setAction(ACTION_TODO_REMINDER);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                    context,
                    requestCode(id),
                    intent,
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pendingIntent != null) {
                alarmManager.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        }
    }

    private static int requestCode(String id) {
        try {
            long numericId = Long.parseLong(id);
            return (int) (numericId ^ (numericId >>> 32));
        } catch (NumberFormatException ignored) {
            return id.hashCode();
        }
    }

    static void showNotification(Context context, String id, String title) {
        ensureNotificationChannel(context);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Intent openTodo = new Intent(context, WebActivity.class)
                .putExtra(WebActivity.EXTRA_START_URL, "https://luukhopman.nl/todo")
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                requestCode(id),
                openTodo,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Todo reminder")
                .setContentText(title)
                .setStyle(new Notification.BigTextStyle().bigText(title))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .build();
        manager.notify(requestCode(id), notification);
    }

    private void ensureNotificationChannel() {
        ensureNotificationChannel(context);
    }

    private static void ensureNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Todo reminders",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Reminders for scheduled household tasks");
        manager.createNotificationChannel(channel);
    }
}

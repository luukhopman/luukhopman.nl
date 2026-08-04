package nl.luukhopman.household;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class TodoReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TodoReminderScheduler.ACTION_TODO_REMINDER.equals(intent.getAction())) return;

        String id = intent.getStringExtra(TodoReminderScheduler.EXTRA_TODO_ID);
        String title = intent.getStringExtra(TodoReminderScheduler.EXTRA_TODO_TITLE);
        long triggerAtMs = intent.getLongExtra(TodoReminderScheduler.EXTRA_TODO_TRIGGER_AT_MS, 0L);
        if (id == null || id.isEmpty() || title == null || title.isEmpty()) return;

        TodoReminderScheduler.showNotification(context, id, title, triggerAtMs);
    }
}

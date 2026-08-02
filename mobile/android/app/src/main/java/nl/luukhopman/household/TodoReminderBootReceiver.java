package nl.luukhopman.household;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class TodoReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            new TodoReminderScheduler(context).rescheduleSaved();
        }
    }
}

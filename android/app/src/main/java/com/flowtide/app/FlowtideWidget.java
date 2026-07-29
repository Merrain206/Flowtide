package com.flowtide.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * 桌面小组件（v0.8 模块二）：今日轮次 / 专注分钟
 *
 * 只做统计展示不做实时倒计时（省电优先）；数据由 LiveTimerPlugin.syncStats
 * 在阶段切换时写入 SharedPreferences，写入后主动刷新所有小组件实例。
 */
public class FlowtideWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    /** 供 LiveTimerPlugin 在统计变化时主动刷新 */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FlowtideWidget.class));
        if (ids != null && ids.length > 0) {
            manager.updateAppWidget(ids, buildViews(context));
        }
    }

    private static RemoteViews buildViews(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(LiveTimerPlugin.WIDGET_PREFS, Context.MODE_PRIVATE);
        int cycles = prefs.getInt("cycles", 0);
        int minutes = prefs.getInt("minutes", 0);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.flowtide_widget);
        views.setTextViewText(R.id.widget_cycles, String.valueOf(cycles));
        views.setTextViewText(R.id.widget_minutes, String.valueOf(minutes));

        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pi);
        return views;
    }
}

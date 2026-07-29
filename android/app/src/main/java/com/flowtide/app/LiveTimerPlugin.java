package com.flowtide.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Collections;

/**
 * 灵动岛实况通知插件（v0.8 模块一）
 *
 * 双层结构，跨品牌通用：
 *  - API 36+（Android 16：HyperOS 3 / ColorOS 16 / OriginOS 6 等）：
 *    Notification.ProgressStyle + requestPromotedOngoing → 状态栏倒计时胶囊 + 锁屏实况卡片
 *  - API 24~35：常驻通知 + 系统级 chronometer 倒计时（无需逐秒刷新，App 被杀也继续走）
 *
 * 通知使用独立低打扰渠道（无声、不震动），与到点提醒渠道（flowtide-alerts）分离。
 */
@CapacitorPlugin(name = "LiveTimer")
public class LiveTimerPlugin extends Plugin {

    private static final String CHANNEL_ID = "flowtide-live";
    private static final int NOTIFY_ID = 2001;

    /** 桌面小组件共享的统计数据存储 */
    static final String WIDGET_PREFS = "flowtide_widget";

    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private void ensureChannel() {
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "实况进度", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("专注/休息进行中的常驻倒计时（静音）");
        ch.setShowBadge(false);
        ch.enableVibration(false);
        ch.setSound(null, null);
        manager().createNotificationChannel(ch);
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(getContext(), 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * 开始/刷新实况通知。
     * 参数：title 标题、text 副文案、chip 状态栏胶囊短文案、
     *      endAt 结束时间戳 ms、totalMs 阶段总时长、paused 是否暂停
     */
    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "专注中");
        String text = call.getString("text", "");
        String chip = call.getString("chip", "");
        Double endAtD = call.getDouble("endAt");
        Double totalD = call.getDouble("totalMs");
        boolean paused = Boolean.TRUE.equals(call.getBoolean("paused", false));
        long endAt = endAtD != null ? endAtD.longValue() : 0L;
        long totalMs = totalD != null ? totalD.longValue() : 0L;

        try {
            ensureChannel();
            Notification notification;
            if (Build.VERSION.SDK_INT >= 36) {
                notification = buildLiveUpdate(title, text, chip, endAt, totalMs, paused);
            } else {
                notification = buildFallback(title, text, endAt, totalMs, paused);
            }
            manager().notify(NOTIFY_ID, notification);
            call.resolve();
        } catch (Exception e) {
            call.reject("live notify failed: " + e.getMessage());
        }
    }

    /** Android 16+：官方 Live Updates（状态栏胶囊 + 锁屏实况卡片） */
    private Notification buildLiveUpdate(String title, String text, String chip,
                                         long endAt, long totalMs, boolean paused) {
        int totalSec = (int) Math.max(1, totalMs / 1000);
        int doneSec = (int) Math.max(0, Math.min(totalSec, totalSec - (endAt - System.currentTimeMillis()) / 1000));

        Notification.Builder nb = new Notification.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_flowtide)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(openAppIntent());

        if (!paused) {
            // 系统级倒计时：展开态实时跳秒，无需逐秒 notify
            nb.setShowWhen(true).setWhen(endAt)
              .setUsesChronometer(true).setChronometerCountDown(true);
        }

        Notification.ProgressStyle style = new Notification.ProgressStyle()
                .setStyledByProgress(false)
                .setProgress(doneSec)
                .setProgressSegments(Collections.singletonList(
                        new Notification.ProgressStyle.Segment(totalSec)));
        nb.setStyle(style);
        // 状态栏胶囊短文案（如「24分」）；系统不支持促升时自动降级为普通常驻通知
        nb.setShortCriticalText(chip);
        // requestPromotedOngoing 为 Android 16 QPR（SDK 36.1）新增，基础 36 SDK 无此符号，反射调用
        try {
            Notification.Builder.class
                    .getMethod("requestPromotedOngoing", boolean.class)
                    .invoke(nb, true);
        } catch (Exception ignored) { }
        return nb.build();
    }

    /** API 24~35 兜底：常驻通知 + chronometer 倒计时 + 进度条 */
    private Notification buildFallback(String title, String text,
                                       long endAt, long totalMs, boolean paused) {
        int totalSec = (int) Math.max(1, totalMs / 1000);
        int doneSec = (int) Math.max(0, Math.min(totalSec, totalSec - (endAt - System.currentTimeMillis()) / 1000));

        NotificationCompat.Builder nb = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_flowtide)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openAppIntent())
                .setProgress(totalSec, doneSec, false);

        if (!paused) {
            nb.setShowWhen(true).setWhen(endAt)
              .setUsesChronometer(true).setChronometerCountDown(true);
        }
        return nb.build();
    }

    /** 结束实况（回到待命/放弃时调用） */
    @PluginMethod
    public void stop(PluginCall call) {
        try {
            manager().cancel(NOTIFY_ID);
        } catch (Exception ignored) { }
        call.resolve();
    }

    /** 当前系统是否支持 Live Updates 促升（用于设置页提示） */
    @PluginMethod
    public void isPromotedSupported(PluginCall call) {
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                supported = manager().canPostPromotedNotifications();
            } catch (Exception ignored) { }
        }
        JSObject ret = new JSObject();
        ret.put("supported", supported);
        call.resolve(ret);
    }

    // ── 后台保活引导（v0.9 模块六） ──────────────────────────

    /** 是否已加入电池优化白名单（允许后台运行） */
    @PluginMethod
    public void checkBatteryOptimization(PluginCall call) {
        boolean ignoring = false;
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ignoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    /** 弹出「忽略电池优化」系统授权框；失败回退到电池优化列表页 */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    /** 跳转自启动管理页：逐个尝试各厂商组件，全失败则回退应用详情页 */
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        if (!tryAutoStartIntents()) {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    /** 跳转本应用系统详情页（权限管理入口） */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception ignored) { }
        call.resolve();
    }

    /** 各厂商自启动管理页组件，逐级尝试；命中即返回 true */
    private boolean tryAutoStartIntents() {
        String[][] comps = {
            {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
            {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
            {"com.oplus.safecenter", "com.oplus.safecenter.startupapp.StartupAppListActivity"},
            {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
            {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
            {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
        };
        for (String[] c : comps) {
            try {
                Intent intent = new Intent();
                intent.setClassName(c[0], c[1]);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                return true;
            } catch (Exception ignored) { }
        }
        // MIUI 官方 action 兜底
        try {
            Intent intent = new Intent("miui.intent.action.OP_AUTO_START");
            intent.addCategory(Intent.CATEGORY_DEFAULT);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception ignored) { }
        return false;
    }

    /** 同步今日统计到 SharedPreferences，并刷新桌面小组件 */
    @PluginMethod
    public void syncStats(PluginCall call) {
        Integer cycles = call.getInt("cycles", 0);
        Integer minutes = call.getInt("minutes", 0);
        SharedPreferences prefs = getContext().getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE);
        prefs.edit()
                .putInt("cycles", cycles != null ? cycles : 0)
                .putInt("minutes", minutes != null ? minutes : 0)
                .apply();
        FlowtideWidget.refreshAll(getContext());
        call.resolve();
    }
}

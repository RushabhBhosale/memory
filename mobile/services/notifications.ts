import { Platform } from 'react-native';

import type { Memory } from './api';
import type * as ExpoNotifications from 'expo-notifications';

const REMINDER_CHANNEL_ID = 'memory-reminders';
let notificationsModule: typeof ExpoNotifications | null | undefined;
let notificationHandlerConfigured = false;

const getNotifications = async () => {
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }

  try {
    notificationsModule = await import('expo-notifications');
  } catch {
    notificationsModule = null;
  }

  if (notificationsModule && !notificationHandlerConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
      })
    });
    notificationHandlerConfigured = true;
  }

  return notificationsModule;
};

const getReminderIdentifier = (memoryId: string) => `memory-reminder-${memoryId}`;

const ensureNotificationPermissions = async () => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return false;
  }

  const currentPermissions = await Notifications.getPermissionsAsync();

  if (currentPermissions.granted) {
    return true;
  }

  const nextPermissions = await Notifications.requestPermissionsAsync();

  return nextPermissions.granted;
};

const ensureReminderChannel = async () => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return false;
  }

  if (Platform.OS !== 'android') {
    return true;
  }

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: 'Memory reminders',
    vibrationPattern: [0, 250, 250, 250]
  });

  return true;
};

export const getNotificationPermissionStatus = async () => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return 'unavailable';
  }

  const permissions = await Notifications.getPermissionsAsync();

  if (permissions.granted) {
    return 'granted';
  }

  return permissions.status || 'undetermined';
};

export const requestNotificationPermissions = async () => {
  const hasPermission = await ensureNotificationPermissions();

  if (hasPermission) {
    await ensureReminderChannel();
  }

  return hasPermission;
};

export const scheduleLocationReminderNotification = async ({
  body,
  reminderId,
  title = 'MemoryOS Reminder',
}: {
  body: string;
  reminderId: string;
  title?: string;
}) => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureNotificationPermissions();

  if (!hasPermission) {
    return null;
  }

  const hasChannel = await ensureReminderChannel();

  if (!hasChannel) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        reminderId,
        source: 'location-reminder'
      },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId: REMINDER_CHANNEL_ID
    }
  });
};

export const scheduleMemoryReminder = async (memory: Memory) => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return null;
  }

  if (!memory.reminderAt || !memory.notificationEnabled) {
    return null;
  }

  const reminderDate = new Date(memory.reminderAt);

  if (Number.isNaN(reminderDate.getTime()) || reminderDate.getTime() <= Date.now()) {
    return null;
  }

  const hasPermission = await ensureNotificationPermissions();

  if (!hasPermission) {
    return null;
  }

  const hasChannel = await ensureReminderChannel();

  if (!hasChannel) {
    return null;
  }

  const identifier = getReminderIdentifier(memory._id);

  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Memory reminder',
      body: memory.title.replace(/^Reminder:\s*/i, ''),
      data: {
        memoryId: memory._id
      },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderDate,
      channelId: REMINDER_CHANNEL_ID
    }
  });
};

export const scheduleTestMemoryNotification = async () => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureNotificationPermissions();

  if (!hasPermission) {
    return null;
  }

  const hasChannel = await ensureReminderChannel();

  if (!hasChannel) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Memory notification test',
      body: 'If you can see this, local notifications are working.',
      data: {
        source: 'notification-test'
      },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      repeats: false,
      channelId: REMINDER_CHANNEL_ID
    }
  });
};

export const scheduleScreenshotSavedNotification = async (title: string) => {
  const Notifications = await getNotifications();

  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureNotificationPermissions();

  if (!hasPermission) {
    return null;
  }

  const hasChannel = await ensureReminderChannel();

  if (!hasChannel) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Screenshot saved to Memory',
      body: title,
      data: {
        source: 'screenshot'
      },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      repeats: false,
      channelId: REMINDER_CHANNEL_ID
    }
  });
};

export const scheduleUpcomingMemoryReminders = async (memories: Memory[]) => {
  const reminders = memories.filter((memory) => memory.reminderAt && memory.notificationEnabled);

  await Promise.allSettled(reminders.map((memory) => scheduleMemoryReminder(memory)));
};

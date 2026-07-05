# Memonest App Actions ADB

Use these commands against an installed Android build.

Important: quote the whole remote command as shown below. `adb shell` passes
the command through the device shell, so an unquoted `&` drops the rest of the
query string before Memonest receives it.

```sh
adb logcat -s AppActions ReactNativeJS
adb shell 'am start -W -a android.intent.action.VIEW -d "memonest://assistant?action=open&feature=capture" com.anonymous.memonest'
adb shell 'am start -W -a android.intent.action.VIEW -d "memonest://assistant?action=open&feature=expenses" com.anonymous.memonest'
adb shell 'am start -W -a android.intent.action.VIEW -d "memonest://assistant?action=open&feature=history" com.anonymous.memonest'
adb shell 'am start -W -a android.intent.action.VIEW -d "memonest://assistant?action=search&name=ActiveX" com.anonymous.memonest'
adb shell 'am start -W -a android.intent.action.VIEW -d "memonest://assistant?action=log&name=test%20release%20build%20on%20Monday&description=Created%20from%20Google%20Assistant" com.anonymous.memonest'
```

package expo.modules.dimesystem

import android.app.UiModeManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DimeSystemModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DimeSystem")

    // Hands the in-app theme choice to Android, which keeps it per app across restarts. That is what
    // makes the system splash screen (drawn before any JS runs) use the same light or dark colours.
    // "light" and "dark" force the mode; anything else follows the device again. Android 12+ only.
    Function("setApplicationNightMode") { mode: String ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = appContext.reactContext?.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        manager?.setApplicationNightMode(
          when (mode) {
            "dark" -> UiModeManager.MODE_NIGHT_YES
            "light" -> UiModeManager.MODE_NIGHT_NO
            else -> UiModeManager.MODE_NIGHT_AUTO
          }
        )
      }
    }

    // True while the widget's capture card is the screen the user is on. The main app's JS shares
    // this runtime, so it must not repaint the window or the system bars then (they are the card's).
    Function("isWidgetCardForeground") {
      appContext.currentActivity?.javaClass?.simpleName == "WidgetActionsActivity"
    }

    // Closes the widget's capture card, and only that: a card timer that fires after the user has
    // moved on to the main app must not finish the main app instead. The class name is matched
    // because this library cannot see the app's activity classes.
    Function("finishWidgetCard") {
      val activity = appContext.currentActivity
      if (activity?.javaClass?.simpleName == "WidgetActionsActivity") {
        activity.runOnUiThread { activity.finish() }
      }
    }
  }
}

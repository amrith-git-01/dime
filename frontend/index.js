import "react-native-reanimated";
import "./splashGate";

import { registerRootComponent } from "expo";
import { AppRegistry } from "react-native";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import App from "./App";
import WidgetActionsRoot from "./src/features/widgetActions/components/WidgetActionsRoot";
import { widgetTaskHandler } from "./src/widgets/widgetTaskHandler";

registerRootComponent(App);
// The Android widget's Add / Scan / Gallery / Voice card: a second, transparent activity
// (WidgetActionsActivity) that renders this component instead of the app.
AppRegistry.registerComponent("WidgetActions", () => WidgetActionsRoot);
// Android home-screen widget: runs in the headless JS task when the launcher updates/clicks it.
registerWidgetTaskHandler(widgetTaskHandler);

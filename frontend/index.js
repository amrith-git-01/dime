import "react-native-reanimated";
import "./splashGate";

import { registerRootComponent } from "expo";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import App from "./App";
import { widgetTaskHandler } from "./src/widgets/widgetTaskHandler";

registerRootComponent(App);
// Android home-screen widgets: runs in the headless JS task when the launcher updates/clicks a widget.
registerWidgetTaskHandler(widgetTaskHandler);

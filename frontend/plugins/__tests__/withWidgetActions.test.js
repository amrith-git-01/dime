const {
  applyManifest,
  applyStyles,
  mergeConfigChanges,
  widgetActionsActivitySource,
} = require("../withWidgetActions");

const PACKAGE = "com.amrith_01.frontend";

function manifestFixture() {
  return {
    manifest: {
      application: [
        {
          activity: [
            {
              $: {
                "android:name": ".MainActivity",
                "android:configChanges": "keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode",
                "android:launchMode": "singleTask",
              },
            },
          ],
        },
      ],
    },
  };
}

describe("mergeConfigChanges", () => {
  it("adds only what is missing and keeps the existing order", () => {
    expect(mergeConfigChanges("keyboard|uiMode", ["uiMode", "density"])).toBe("keyboard|uiMode|density");
    expect(mergeConfigChanges(undefined, ["density"])).toBe("density");
  });
});

describe("applyManifest", () => {
  it("lets MainActivity handle font scale, density, locale and layout direction itself", () => {
    const manifest = applyManifest(manifestFixture(), PACKAGE);
    const main = manifest.manifest.application[0].activity.find(
      (activity) => activity.$["android:name"] === ".MainActivity",
    );
    const changes = main.$["android:configChanges"].split("|");
    for (const change of [
      "keyboard",
      "keyboardHidden",
      "orientation",
      "screenSize",
      "screenLayout",
      "uiMode",
      "fontScale",
      "density",
      "locale",
      "layoutDirection",
      "smallestScreenSize",
    ]) {
      expect(changes).toContain(change);
    }
  });

  it("declares the card activity: exported, single task, its own task, not in recents, dimecard scheme", () => {
    const manifest = applyManifest(manifestFixture(), PACKAGE);
    const card = manifest.manifest.application[0].activity.find(
      (activity) => activity.$["android:name"] === ".WidgetActionsActivity",
    );
    expect(card.$).toMatchObject({
      "android:exported": "true",
      "android:launchMode": "singleTask",
      "android:taskAffinity": "com.amrith_01.frontend.widgetactions",
      "android:excludeFromRecents": "true",
      "android:windowSoftInputMode": "adjustResize",
      "android:theme": "@style/Theme.Dime.WidgetActions",
    });
    expect(card.$["android:configChanges"]).toContain("uiMode");
    const filter = card["intent-filter"][0];
    expect(filter.action[0].$["android:name"]).toBe("android.intent.action.VIEW");
    // Not BROWSABLE: a web page must not be able to open the card.
    expect(filter.category.map((category) => category.$["android:name"])).toEqual([
      "android.intent.category.DEFAULT",
    ]);
    expect(filter.data).toEqual([{ $: { "android:scheme": "dimecard" } }]);
  });

  it("is idempotent", () => {
    const once = applyManifest(manifestFixture(), PACKAGE);
    const twice = applyManifest(JSON.parse(JSON.stringify(once)), PACKAGE);
    expect(twice).toEqual(once);
    expect(
      twice.manifest.application[0].activity.filter(
        (activity) => activity.$["android:name"] === ".WidgetActionsActivity",
      ),
    ).toHaveLength(1);
  });

  it("fails loudly when MainActivity is missing", () => {
    expect(() =>
      applyManifest({ manifest: { application: [{ activity: [] }] } }, PACKAGE),
    ).toThrow("MainActivity not found");
  });
});

describe("applyStyles", () => {
  const stylesFixture = () => ({ resources: { style: [{ $: { name: "AppTheme" }, item: [] }] } });

  it("adds a translucent, dimmed, transparent-window theme on AppCompat DayNight", () => {
    const { resources } = applyStyles(stylesFixture());
    const theme = resources.style.find((style) => style.$.name === "Theme.Dime.WidgetActions");
    expect(theme.$.parent).toBe("Theme.AppCompat.DayNight.NoActionBar");
    const items = Object.fromEntries(theme.item.map((item) => [item.$.name, item._]));
    expect(items).toMatchObject({
      "android:windowIsTranslucent": "true",
      "android:windowBackground": "@android:color/transparent",
      "android:windowNoTitle": "true",
      "android:backgroundDimEnabled": "true",
      "android:windowAnimationStyle": "@android:style/Animation.Translucent",
    });
    // The app's own theme is left alone.
    expect(resources.style.find((style) => style.$.name === "AppTheme")).toBeDefined();
  });

  it("is idempotent", () => {
    const once = applyStyles(stylesFixture());
    const twice = applyStyles(JSON.parse(JSON.stringify(once)));
    expect(twice.resources.style.filter((style) => style.$.name === "Theme.Dime.WidgetActions")).toHaveLength(1);
  });
});

describe("widgetActionsActivitySource", () => {
  const source = widgetActionsActivitySource(PACKAGE);

  it("is a ReactActivity for the WidgetActions component, wrapped like MainActivity", () => {
    expect(source).toContain(`package ${PACKAGE}`);
    expect(source).toContain("class WidgetActionsActivity : ReactActivity()");
    expect(source).toContain('override fun getMainComponentName(): String = "WidgetActions"');
    expect(source).toContain("ReactActivityDelegateWrapper(");
    expect(source).toContain("BuildConfig.IS_NEW_ARCHITECTURE_ENABLED");
  });

  it("does not register the splash screen (only MainActivity shows it)", () => {
    expect(source).not.toContain("SplashScreenManager");
  });

  it("closes on Back without asking JS, and dims only the quick-add card", () => {
    expect(source).toContain("override fun onBackPressed()");
    expect(source).toContain("finish()");
    expect(source).toContain('mode == "add"');
    expect(source).toContain("onNewIntent");
  });
});

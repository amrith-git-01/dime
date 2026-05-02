#!/usr/bin/env node

/**
 * Resets src/app to a minimal Expo Router shell (index + root layout).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = process.cwd();
const oldDirs = [path.join('src', 'app')];
const exampleDir = 'app-example';
const newAppDir = path.join('src', 'app');
const exampleDirPath = path.join(root, exampleDir);

const indexContent = `import { Text, View } from "react-native";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Edit src/app/index.tsx to edit this screen.</Text>
    </View>
  );
}
`;

const layoutContent = `import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}
`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const moveDirectories = async (userInput) => {
  try {
    if (userInput === 'y') {
      await fs.promises.mkdir(exampleDirPath, { recursive: true });
      console.log(`📁 /${exampleDir} directory created.`);
    }

    for (const dir of oldDirs) {
      const oldDirPath = path.join(root, dir);
      if (fs.existsSync(oldDirPath)) {
        if (userInput === 'y') {
          const newDirPath = path.join(root, exampleDir, dir);
          await fs.promises.mkdir(path.dirname(newDirPath), { recursive: true });
          await fs.promises.rename(oldDirPath, newDirPath);
          console.log(`➡️ /${dir} moved to /${exampleDir}/${dir}.`);
        } else {
          await fs.promises.rm(oldDirPath, { recursive: true, force: true });
          console.log(`❌ /${dir} deleted.`);
        }
      } else {
        console.log(`➡️ /${dir} does not exist, skipping.`);
      }
    }

    await fs.promises.mkdir(path.join(root, newAppDir), { recursive: true });
    console.log(`\n📁 New /${newAppDir} directory created.`);

    const indexPath = path.join(root, newAppDir, 'index.tsx');
    await fs.promises.writeFile(indexPath, indexContent);
    console.log(`📄 ${newAppDir}/index.tsx created.`);

    const layoutPath = path.join(root, newAppDir, '_layout.tsx');
    await fs.promises.writeFile(layoutPath, layoutContent);
    console.log(`📄 ${newAppDir}/_layout.tsx created.`);

    console.log('\n✅ Project reset complete. Next steps:');
    console.log(
      `1. Run \`npx expo start\` to start a development server.\n2. Edit ${newAppDir}/index.tsx to edit the main screen.${userInput === 'y'
        ? `\n3. Delete the /${exampleDir} directory when you're done referencing it.`
        : ''
      }`
    );
  } catch (error) {
    console.error(`❌ Error during script execution: ${error.message}`);
  }
};

rl.question(
  'Do you want to move existing files to /app-example instead of deleting them? (Y/n): ',
  (answer) => {
    const userInput = answer.trim().toLowerCase() || 'y';
    if (userInput === 'y' || userInput === 'n') {
      moveDirectories(userInput).finally(() => rl.close());
    } else {
      console.log("❌ Invalid input. Please enter 'Y' or 'N'.");
      rl.close();
    }
  }
);

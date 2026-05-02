#!/usr/bin/env node

/**
 * Resets src/screens and src/navigation to a minimal React Navigation shell.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const root = process.cwd();
const pathsToReset = [path.join('src', 'screens'), path.join('src', 'navigation')];
const exampleDir = 'app-example';
const exampleDirPath = path.join(root, exampleDir);

const homeScreen = `import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dime</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: '#111111',
  },
});
`;

const rootNavigator = `import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '@/screens/home/HomeScreen';

import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
    </Stack.Navigator>
  );
}
`;

const navTypes = `export type RootStackParamList = {
  Home: undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const run = async (userInput) => {
  try {
    if (userInput === 'y') {
      await fs.promises.mkdir(exampleDirPath, { recursive: true });
      console.log(`📁 /${exampleDir} created.`);
    }

    for (const dir of pathsToReset) {
      const full = path.join(root, dir);
      if (fs.existsSync(full)) {
        if (userInput === 'y') {
          const dest = path.join(exampleDirPath, dir);
          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await fs.promises.rename(full, dest);
          console.log(`➡️ /${dir} → /${exampleDir}/${dir}`);
        } else {
          await fs.promises.rm(full, { recursive: true, force: true });
          console.log(`❌ /${dir} deleted.`);
        }
      }
    }

    await fs.promises.mkdir(path.join(root, 'src', 'screens', 'home'), { recursive: true });
    await fs.promises.mkdir(path.join(root, 'src', 'navigation'), { recursive: true });

    await fs.promises.writeFile(
      path.join(root, 'src', 'screens', 'home', 'HomeScreen.tsx'),
      homeScreen
    );
    await fs.promises.writeFile(path.join(root, 'src', 'navigation', 'RootNavigator.tsx'), rootNavigator);
    await fs.promises.writeFile(path.join(root, 'src', 'navigation', 'types.ts'), navTypes);

    console.log('\n✅ Reset complete. Run `npx expo start`.');
  } catch (error) {
    console.error(`❌ ${error.message}`);
  }
};

rl.question('Move old src/screens + src/navigation to /app-example? (Y/n): ', (answer) => {
  const userInput = answer.trim().toLowerCase() || 'y';
  if (userInput === 'y' || userInput === 'n') {
    run(userInput).finally(() => rl.close());
  } else {
    console.log("❌ Enter 'Y' or 'N'.");
    rl.close();
  }
});

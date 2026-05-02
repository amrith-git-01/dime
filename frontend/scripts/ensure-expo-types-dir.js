#!/usr/bin/env node

/**
 * expo-router typed routes write to .expo/types/router.d.ts without mkdir — ensure the folder exists.
 */

const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, '..', '.expo', 'types');
fs.mkdirSync(typesDir, { recursive: true });

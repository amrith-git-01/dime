/**
 * Merges static `app.json` with dynamic Android options.
 */
module.exports = ({ config }) => {
  const previous = config.android?.permissions;
  const baseList = Array.isArray(previous) ? previous : [];
  const permissions = new Set(
    baseList.filter((p) => p !== "RECEIVE_SMS"),
  );
  permissions.add("POST_NOTIFICATIONS");
  permissions.add("READ_SMS");

  return {
    ...config,
    android: {
      ...config.android,
      permissions: Array.from(permissions),
    },
  };
};

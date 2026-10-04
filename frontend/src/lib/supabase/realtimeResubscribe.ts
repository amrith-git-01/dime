/**
 * Status callback for `channel.subscribe` that calls `onResubscribed` each time the channel
 * reconnects (SUBSCRIBED after the first one). Postgres changes made while it was down are
 * never replayed, so the caller must refetch what the channel feeds.
 */
export function createResubscribeHandler(
  onResubscribed: () => void,
): (status: string) => void {
  let subscribedBefore = false;
  return (status) => {
    if (status !== "SUBSCRIBED") {
      return;
    }
    if (subscribedBefore) {
      onResubscribed();
    }
    subscribedBefore = true;
  };
}

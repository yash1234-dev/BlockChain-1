import { createApp } from "./app.js";
import { FACILITATOR_URL, NETWORK, PAY_TO, PORT } from "./config.js";

const app = createApp();

app.listen(PORT, () => {
  console.log(`operators-booth listening on http://localhost:${PORT}`);
  console.log(`network=${NETWORK} payTo=${PAY_TO} facilitator=${FACILITATOR_URL}`);
});

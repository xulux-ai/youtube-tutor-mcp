import { createTutorServer } from "./src/server/createTutorServer.js";

const server = createTutorServer();
const port = Number(process.env.PORT ?? 3000);

server.listen(port).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

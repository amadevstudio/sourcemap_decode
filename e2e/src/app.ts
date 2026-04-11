import { formatUser, validateEmail } from "./utils";

function initApp() {
  const user = formatUser("Alice", 30);
  console.log(user);

  // This will throw
  validateEmail("not-an-email");
}

function bootstrap() {
  try {
    initApp();
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.stack);
    }
  }
}

bootstrap();

import settings from "../src/settings.ini";

export default {
  fetch() {
    return Response.json(settings);
  },
};

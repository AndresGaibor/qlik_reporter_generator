import { notifyManager } from "@tanstack/react-query";
import { act } from "react";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

notifyManager.setNotifyFunction((callback) => {
  act(callback);
});

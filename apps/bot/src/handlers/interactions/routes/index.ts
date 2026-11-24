import type { NujumClient } from "../../../client/NujumClient";
import { helpRefreshButton } from "./help";
import { securityUnlockButton } from "./security";
import { verificationCodeModal, verificationStartButton } from "./verification";
import type { ButtonRoute, ModalRoute, SelectRoute } from "../types";

export const buttonRoutes: readonly ButtonRoute[] = [
  helpRefreshButton,
  securityUnlockButton,
  verificationStartButton,
];
export const selectRoutes: readonly SelectRoute[] = [];
export const modalRoutes: readonly ModalRoute[] = [verificationCodeModal];

export function registerInteractionRoutes(client: NujumClient): void {
  for (const route of buttonRoutes) {
    const key = `${route.module}:${route.action}`;
    if (client.buttonRoutes.has(key)) throw new Error(`Duplicate button route: ${key}`);
    client.buttonRoutes.set(key, route);
  }
  for (const route of selectRoutes) {
    const key = `${route.module}:${route.action}`;
    if (client.selectRoutes.has(key)) throw new Error(`Duplicate select route: ${key}`);
    client.selectRoutes.set(key, route);
  }
  for (const route of modalRoutes) {
    const key = `${route.module}:${route.action}`;
    if (client.modalRoutes.has(key)) throw new Error(`Duplicate modal route: ${key}`);
    client.modalRoutes.set(key, route);
  }

  client.logger.info(
    {
      buttons: client.buttonRoutes.size,
      selects: client.selectRoutes.size,
      modals: client.modalRoutes.size,
    },
    "interaction routes loaded",
  );
}

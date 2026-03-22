import type { AvailableIntentsEventsEnum, OpenAPI, GMessageRec } from "qq-bot-sdk";

// QQ Bot configuration resolved from openclaw.json
export type QQBotConfig = {
  appId: string;
  token: string;
  secret?: string;
  sandbox?: boolean;
};

export type QQAccountConfig = QQBotConfig & {
  enabled?: boolean;
  allowFrom?: Array<string | number>;
  dmPolicy?: string;
  groupPolicy?: string;
  groupAllowFrom?: Array<string | number>;
};

// Resolved account info
export type ResolvedQQAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  config: QQAccountConfig;
  appId?: string;
};

// Sent message result
export type QQSendResult = {
  messageId: string;
};

// Inbound message shape from QQ events (typed loosely since SDK uses `object`)
type QQEventMessage = {
  id?: string;
  content?: string;
  group_openid?: string;
  group_id?: string;
  author?: {
    member_openid?: string;
    user_openid?: string;
    id?: string;
    username?: string;
  };
} & Record<string, unknown>;

/**
 * Start QQ Bot and listen for messages.
 *
 * Uses qq-bot-sdk to connect to QQ's official API via WebSocket,
 * then dispatches received messages to the OpenClaw runtime.
 */
export async function startQQBot(opts: {
  config: QQBotConfig;
  accountId: string;
  abortSignal: AbortSignal;
  onMessage: (msg: {
    content: string;
    senderId: string;
    senderName?: string;
    groupId?: string;
    messageId: string;
    isDirect: boolean;
  }) => void;
  log?: { info: (msg: string) => void; error: (msg: string) => void };
}): Promise<void> {
  const { config, abortSignal, onMessage, log } = opts;

  // Dynamic import qq-bot-sdk
  const { createOpenAPI, createWebsocket } = await import("qq-bot-sdk");

  const intents: AvailableIntentsEventsEnum[] = [
    "GROUP_AND_C2C_EVENT" as AvailableIntentsEventsEnum,
    "DIRECT_MESSAGE" as AvailableIntentsEventsEnum,
  ];

  const client = createOpenAPI({
    appID: config.appId,
    token: config.token,
    secret: config.secret,
    sandbox: config.sandbox ?? false,
  });

  const ws = createWebsocket({
    appID: config.appId,
    token: config.token,
    secret: config.secret,
    sandbox: config.sandbox ?? false,
    intents,
  });

  // Handle group @mentions
  ws.on("GROUP_AT_MESSAGE_CREATE", (data: { msg: QQEventMessage }) => {
    const msg = data.msg;
    onMessage({
      content: String(msg.content ?? "").trim(),
      senderId: String(msg.author?.member_openid ?? msg.author?.id ?? ""),
      senderName: String(msg.author?.username ?? ""),
      groupId: String(msg.group_openid ?? msg.group_id ?? ""),
      messageId: String(msg.id ?? ""),
      isDirect: false,
    });
  });

  // Handle direct (C2C) messages
  ws.on("C2C_MESSAGE_CREATE", (data: { msg: QQEventMessage }) => {
    const msg = data.msg;
    onMessage({
      content: String(msg.content ?? "").trim(),
      senderId: String(msg.author?.user_openid ?? msg.author?.id ?? ""),
      senderName: String(msg.author?.username ?? ""),
      messageId: String(msg.id ?? ""),
      isDirect: true,
    });
  });

  // Handle abort
  abortSignal.addEventListener("abort", () => {
    log?.info("QQ Bot shutting down");
    try {
      ws.disconnect();
    } catch {
      // ignore
    }
  });

  log?.info(`QQ Bot connecting (appId: ${config.appId}, sandbox: ${config.sandbox ?? false})`);

  // Store client reference for sending messages
  setQQClient(client);
}

// Global client ref for sending messages
let qqClient: OpenAPI | null = null;

function setQQClient(client: OpenAPI) {
  qqClient = client;
}

function getQQClient(): OpenAPI {
  if (!qqClient) {
    throw new Error("QQ Bot not connected");
  }
  return qqClient;
}

/**
 * Send a text message to a QQ group.
 */
export async function sendGroupMessage(
  groupOpenId: string,
  content: string,
  msgId?: string,
): Promise<QQSendResult> {
  const client = getQQClient();
  const result = await client.groupApi.postMessage(groupOpenId, {
    content,
    msg_type: 0,
    msg_id: msgId,
  });
  return { messageId: String((result.data as GMessageRec)?.msg_seq ?? "") };
}

/**
 * Send a text message to a QQ user (C2C / direct).
 */
export async function sendDirectMessage(
  userOpenId: string,
  content: string,
  msgId?: string,
): Promise<QQSendResult> {
  const client = getQQClient();
  const result = await client.c2cApi.postMessage(userOpenId, {
    content,
    msg_type: 0,
    msg_id: msgId,
  });
  return { messageId: String((result.data as GMessageRec)?.msg_seq ?? "") };
}

/**
 * Send a message to either group or user based on target format.
 * Targets prefixed with "group:" go to groups, "user:" or bare IDs go to users.
 */
export async function sendQQMessage(
  to: string,
  content: string,
  msgId?: string,
): Promise<QQSendResult> {
  if (to.startsWith("group:")) {
    return sendGroupMessage(to.slice(6), content, msgId);
  }
  const userId = to.startsWith("user:") ? to.slice(5) : to;
  return sendDirectMessage(userId, content, msgId);
}

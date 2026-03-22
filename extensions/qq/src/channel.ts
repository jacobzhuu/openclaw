import type { ChannelMeta, ChannelPlugin } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedQQAccount, QQAccountConfig } from "./bot.js";
import { sendQQMessage, startQQBot } from "./bot.js";
import { getQQRuntime } from "./runtime.js";

const meta: ChannelMeta = {
  id: "qq",
  label: "QQ",
  selectionLabel: "QQ (腾讯QQ)",
  docsPath: "/channels/qq",
  docsLabel: "qq",
  blurb: "QQ messaging via official QQ Bot API.",
  order: 70,
  quickstartAllowFrom: true,
};

// Helper: resolve QQ config from openclaw.json
function resolveQQConfig(cfg: Record<string, unknown>): QQAccountConfig {
  const channels = cfg.channels as Record<string, unknown> | undefined;
  const qqCfg = (channels?.qq ?? {}) as QQAccountConfig;
  return qqCfg;
}

// Helper: resolve account from config
function resolveQQAccount(params: {
  cfg: Record<string, unknown>;
  accountId?: string | null;
}): ResolvedQQAccount {
  const qqCfg = resolveQQConfig(params.cfg);
  const configured = Boolean(qqCfg.appId?.trim() && qqCfg.token?.trim());
  return {
    accountId: params.accountId ?? DEFAULT_ACCOUNT_ID,
    enabled: qqCfg.enabled !== false,
    configured,
    config: qqCfg,
    appId: qqCfg.appId,
  };
}

// Normalize target: prefix with group: or user:
function normalizeQQTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Already prefixed
  if (trimmed.startsWith("group:") || trimmed.startsWith("user:")) return trimmed;
  // Default to user
  return trimmed;
}

function looksLikeQQId(raw: string): boolean {
  const trimmed = raw.trim();
  // QQ openid format or numeric id
  return /^(group:|user:)?[\w-]+$/.test(trimmed);
}

export const qqPlugin: ChannelPlugin<ResolvedQQAccount> = {
  id: "qq",
  meta: { ...meta },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    polls: false,
    reactions: false,
    threads: false,
  },

  reload: { configPrefixes: ["channels.qq"] },

  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: (cfg, accountId) => resolveQQAccount({ cfg, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      appId: account.appId,
    }),
    setAccountEnabled: ({ cfg, enabled }) => ({
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown>),
        qq: {
          ...resolveQQConfig(cfg),
          enabled,
        },
      },
    }),
    deleteAccount: ({ cfg }) => {
      const next = { ...cfg };
      const nextChannels = { ...(cfg.channels as Record<string, unknown>) };
      delete nextChannels.qq;
      if (Object.keys(nextChannels).length > 0) {
        (next as Record<string, unknown>).channels = nextChannels;
      } else {
        delete (next as Record<string, unknown>).channels;
      }
      return next;
    },
    resolveAllowFrom: ({ cfg }) => {
      const qqCfg = resolveQQConfig(cfg);
      return (qqCfg.allowFrom ?? []).map((entry) => String(entry));
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },

  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        appId: { type: "string" },
        token: { type: "string" },
        secret: { type: "string" },
        sandbox: { type: "boolean" },
        dmPolicy: { type: "string", enum: ["open", "pairing", "allowlist"] },
        allowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
        groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
        groupAllowFrom: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "number" }] },
        },
      },
    },
  },

  pairing: {
    idLabel: "qqUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(qq|user):/i, ""),
  },

  security: {
    collectWarnings: ({ cfg }) => {
      const qqCfg = resolveQQConfig(cfg);
      const groupPolicy = qqCfg.groupPolicy ?? "allowlist";
      if (groupPolicy !== "open") return [];
      return [
        `- QQ groups: groupPolicy="open" allows any group member to trigger. Set channels.qq.groupPolicy="allowlist" + channels.qq.groupAllowFrom to restrict.`,
      ];
    },
  },

  messaging: {
    normalizeTarget: (raw) => normalizeQQTarget(raw),
    targetResolver: {
      looksLikeId: looksLikeQQId,
      hint: "<groupOpenId|userOpenId|group:xxx|user:xxx>",
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 2000,
    sendText: async ({ to, text }) => {
      const result = await sendQQMessage(to, text);
      return { channel: "qq", ...result };
    },
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,
    applyAccountConfig: ({ cfg }) => ({
      ...cfg,
      channels: {
        ...(cfg.channels as Record<string, unknown>),
        qq: {
          ...resolveQQConfig(cfg),
          enabled: true,
        },
      },
    }),
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = resolveQQAccount({ cfg: ctx.cfg, accountId: ctx.accountId });
      if (!account.configured) {
        throw new Error("QQ not configured: set channels.qq.appId and channels.qq.token");
      }

      ctx.log?.info(
        `starting QQ bot [${ctx.accountId}] (appId: ${account.config.appId}, sandbox: ${account.config.sandbox ?? false})`,
      );

      const runtime = getQQRuntime();

      return startQQBot({
        config: account.config,
        accountId: ctx.accountId,
        abortSignal: ctx.abortSignal,
        log: ctx.log ? { info: ctx.log.info, error: ctx.log.error } : undefined,
        onMessage: (msg) => {
          // Dispatch inbound message to OpenClaw runtime
          const chatType = msg.isDirect ? "direct" : "group";
          runtime.inbound.dispatch({
            channel: "qq",
            accountId: ctx.accountId,
            chatType,
            senderId: msg.senderId,
            senderName: msg.senderName,
            groupId: msg.groupId,
            text: msg.content,
            messageId: msg.messageId,
            replyTo: msg.isDirect ? `user:${msg.senderId}` : `group:${msg.groupId}`,
          });
        },
      });
    },
  },
};

"use client";

import { type IntlError, IntlErrorCode, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

interface Props {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}

function onError(err: IntlError) {
  if (err.code === IntlErrorCode.MISSING_MESSAGE) return;
  console.error(err);
}

function getMessageFallback({
  namespace,
  key,
  error,
}: {
  namespace?: string;
  key: string;
  error: IntlError;
}): string {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) {
    return key;
  }
  return `${namespace ? `${namespace}.` : ""}${key}`;
}

export function I18nProvider({ locale, messages, children }: Props) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={onError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}

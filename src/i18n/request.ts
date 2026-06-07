import { getRequestConfig } from "next-intl/server";
import { isLocale, routing } from "@/i18n/routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  const messages = (await import(`./messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: "Asia/Jerusalem",
  };
});

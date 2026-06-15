import { describe, expect, test } from "bun:test";
import { HELP_SECTIONS, type HelpPageKey } from "@/components/help/help-content";
import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";

type HelpMessages = {
  help: {
    triggerLabel: string;
  } & Record<
    string,
    | string
    | {
        title: string;
        intro: string;
        sections: Record<string, { title: string; body: string }>;
      }
  >;
};

const locales: Record<string, HelpMessages> = {
  en: en as unknown as HelpMessages,
  he: he as unknown as HelpMessages,
};

const pages = Object.keys(HELP_SECTIONS) as HelpPageKey[];

describe("help content parity", () => {
  test("every page has at least one section", () => {
    for (const page of pages) {
      expect(HELP_SECTIONS[page].length).toBeGreaterThan(0);
    }
  });

  for (const [locale, messages] of Object.entries(locales)) {
    test(`${locale} has triggerLabel`, () => {
      expect(typeof messages.help.triggerLabel).toBe("string");
      expect(messages.help.triggerLabel.length).toBeGreaterThan(0);
    });

    for (const page of pages) {
      test(`${locale} has title and intro for ${page}`, () => {
        const entry = messages.help[page];
        expect(typeof entry).toBe("object");
        if (typeof entry === "object") {
          expect(entry.title.length).toBeGreaterThan(0);
          expect(entry.intro.length).toBeGreaterThan(0);
        }
      });

      for (const { id } of HELP_SECTIONS[page]) {
        test(`${locale} has copy for ${page}.${id}`, () => {
          const entry = messages.help[page];
          expect(typeof entry).toBe("object");
          if (typeof entry === "object") {
            const section = entry.sections[id];
            expect(section).toBeDefined();
            expect(section.title.length).toBeGreaterThan(0);
            expect(section.body.length).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});

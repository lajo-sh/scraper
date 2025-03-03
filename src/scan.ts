import type { Browser } from "playwright";
import { openai } from "./openai";
import { generateObject } from "ai";
import { z } from "zod";

const CONFIDENCE_THRESHOLD = 0.75;

const systemPrompt = `
You scan for phishing websites. You will be given the text of a website.
Phishing websites often impersonate large sites.
Other languages must also be protected.

Respond in the json schema: "{ isPhishing: boolean, confidence: number, explanation: string, impersonatedDomain: string }". 
Confidence is a decimal number between 0 and 1 indicating how likely the site is phishing. 
A website should only be flagged as phishing (isPhishing: true) if you are very sure. 
A lot of phishing websites target crypto wallets, banks, and social media sites.

Also analyze the domain. If the domain is impersonating another domain, include the impersonated domain in the response.


In the explanation field, explain why you think the website is phishing.

The explanation will be shown to the users. Make it 2 sentences max. Include common phishing pattern so the user can learn what's sus with the website.

DO NOT INCLUDE ANYTHING ELSE. RESPOND IN PURE JSON.
`;

export async function scanWebsite(url: string, browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url);
    await page.waitForLoadState("networkidle");

    const text = await page.evaluate(async () => {
      const scripts = document.querySelectorAll("script, style");

      for (const script of scripts) {
        script.remove();
      }

      const iframes = document.querySelectorAll("iframe");
      const iframeTexts = Array.from(iframes).map((iframe) => {
        try {
          return iframe.contentDocument?.body?.innerText || "";
        } catch {
          return "";
        }
      });

      const inputs = document.querySelectorAll("input");
      const inputTexts = Array.from(inputs).map(
        (input) =>
          input.value ||
          input.placeholder ||
          input.getAttribute("aria-label") ||
          "",
      );

      const bodyText = document.body.innerText;

      return `${bodyText} ${inputTexts.join(" ")} ${iframeTexts.join(" ")}`;
    });

    const { object } = await generateObject({
      model: openai(process.env.OPENAI_MODEL!),
      schema: z.object({
        isPhishing: z.boolean(),
        confidence: z.number(),
        explanation: z.string(),
      }),
      system: systemPrompt,
      prompt: JSON.stringify({
        domain: url,
        text,
      }),
    });

    console.log(object);

    // Only flag as phishing if confidence exceeds the threshold.
    const result =
      object.isPhishing && object.confidence >= CONFIDENCE_THRESHOLD;

    console.log(result, object.confidence);

    return {
      isPhishing: result,
      explanation: object.explanation,
      confidence: object.confidence,
    };
  } catch (error) {
    console.error(`Error scanning website ${url}:`, error);
    return {
      isPhishing: false,
      explanation: "Error scanning website",
      confidence: 0,
    };
  } finally {
    await context.close();
  }
}

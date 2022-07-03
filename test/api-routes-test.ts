import { test, expect } from "@playwright/test";
import { createAppFixture, createFixture, js } from "./helpers/create-fixture.js";
import { PlaywrightFixture } from "./helpers/playwright-fixture.js";
import type { AppFixture, Fixture } from "./helpers/create-fixture.js";

test.describe("api routes", () => {
  let appFixture: AppFixture;
  let fixture: Fixture;
  test.beforeAll(async () => {
    fixture = await createFixture({
      files: {
        "src/routes/index.jsx": js`
          export default () => (
            <>
              <a href="/redirect" rel="external">Redirect</a>
              <form action="/redirect-to" method="post">
                <input name="destination" value="/redirect-destination" />
                <button type="submit">Redirect</button>
              </form>
            </>
          )
        `,
        "src/routes/redirected.jsx": js`
          export default () => <div data-testid="redirected">You were redirected</div>;
        `,
        "src/routes/redirect.jsx": js`
          import { redirect } from "solid-start/server";

          export let get = () => redirect("/redirected");
        `,
        "src/routes/redirect-to.jsx": js`
          import { redirect } from "solid-start/server";

          export let post = async ({ request }) => {
            let formData = await request.formData();
            return redirect(formData.get('destination'));
          }
        `,
        "src/routes/redirect-destination.jsx": js`
          export default () => <div data-testid="redirect-destination">You made it!</div>
        `,
        "src/routes/data.json.jsx": js`
          import { json } from "solid-start/server";
          export let get = () => json({hello: "world"});
        `,
        "src/routes/api/greeting/hello.js": js`
          import { json } from "solid-start/server";
          export let get = ({ params }) => json({hello: "world"});
        `,
        "src/routes/api/greeting/[name].js": js`
          import { json } from "solid-start/server";
          export let get = ({ params }) => json({welcome: params.name});
        `,
        "src/routes/api/greeting/[...unknown].js": js`
          import { json } from "solid-start/server";
          export let get = ({ params }) => json({goodbye: params.unknown});
        `,
        "src/routes/api/request.js": js`
          import { json } from "solid-start/server";
          export let get = ({ request }) => json({ requesting: request.headers.get("name") });
        `,
        "src/routes/api/waterfall.js": js`
          import { json } from "solid-start/server";
          export let get = ({ request, fetch  }) => fetch('/api/greeting/harry-potter');
        `,
        "src/routes/api/double-waterfall.js": js`
          import { json } from "solid-start/server";
          export let get = ({ request, fetch }) => fetch('/api/waterfall');
        `,
        "src/routes/api/external-fetch.js": js`
          import { json } from "solid-start/server";
          export let get = ({ request, fetch }) => fetch('https://hogwarts.deno.dev/');
        `,
        "src/routes/api/fetch.js": js`
          import { json } from "solid-start/server";
          export let get = ({ request }) => fetch('https://hogwarts.deno.dev/');
        `
      }
    });

    appFixture = await createAppFixture(fixture);
  });

  test.afterAll(async () => {
    await appFixture.close();
  });

  test.describe("with JavaScript", () => {
    runTests();
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });
    runTests();
  });

  function runTests() {
    test("should redirect to redirected", async ({ page }) => {
      let app = new PlaywrightFixture(appFixture, page);
      await app.goto("/");
      await page.click("a[href='/redirect']");
      await page.waitForSelector("[data-testid='redirected']");
    });

    test("should handle post to destination", async ({ page }) => {
      let app = new PlaywrightFixture(appFixture, page);
      await app.goto("/");
      await page.click("button[type='submit']");
      await page.waitForSelector("[data-testid='redirect-destination']");
    });

    test("should render json from API route with .json file extension", async ({ page }) => {
      let app = new PlaywrightFixture(appFixture, page);
      await app.goto("/data.json");
      expect(await page.content()).toContain('{"hello":"world"}');
    });

    test("should return json from API route", async ({ page }) => {
      let res = await fixture.requestDocument("/data.json");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ hello: "world" });
    });

    test("should return json from /api/greeting/hello API route", async () => {
      let res = await fixture.requestDocument("/api/greeting/hello");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ hello: "world" });
    });

    test("should return json from /api/greeting/[name] API named route", async () => {
      let res = await fixture.requestDocument("/api/greeting/harry-potter");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ welcome: "harry-potter" });
    });

    test("should return json from /api/greeting/[...unknown] API unmatched route", async () => {
      let res = await fixture.requestDocument("/api/greeting/he/who/must/not/be/named");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ goodbye: "he/who/must/not/be/named" });
    });

    test("should return json with header data from request", async () => {
      let res = await fixture.requestDocument("/api/request", {
        headers: { name: "harry-potter" }
      });
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ requesting: "harry-potter" });
    });

    test("should return json from internally fetched API route", async () => {
      let res = await fixture.requestDocument("/api/waterfall");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ welcome: "harry-potter" });
    });

    test("should return json from doubly internally fetched API route", async () => {
      let res = await fixture.requestDocument("/api/double-waterfall");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ welcome: "harry-potter" });
    });

    test("should return json from externally fetched API route", async () => {
      let res = await fixture.requestDocument("/api/double-waterfall");
      expect(res.headers.get("content-type")).toEqual("application/json; charset=utf-8");
      expect(await res.json()).toEqual({ welcome: "harry-potter" });
    });

    test("should return json from API route with external fetch call", async () => {
      let res = await fixture.requestDocument("/api/external-fetch");
      expect(res.headers.get("content-type")).toEqual("application/json");
      expect(await res.json()).toEqual({ message: "Hello from Hogwarts" });
    });

    test("should return json from API route with global fetch call", async () => {
      let res = await fixture.requestDocument("/api/fetch");
      expect(res.headers.get("content-type")).toEqual("application/json");
      expect(await res.json()).toEqual({ message: "Hello from Hogwarts" });
    });
  }
});

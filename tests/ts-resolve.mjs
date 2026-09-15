import { register } from "node:module";

/**
 * Lets `node --test` follow the app's own import style.
 *
 * The source imports siblings without an extension ("./rank"), which is what tsc and
 * Next expect but not what Node's ESM resolver accepts. This hook tries the .ts file
 * before giving up, so the tests can import lib/ directly instead of keeping a parallel
 * copy of it. A query string is kept after the extension, so "../lib/db?fresh" still
 * resolves — that is how a test gets a second, freshly evaluated copy of a module.
 */
register(
  `data:text/javascript,
   export async function resolve(specifier, context, next) {
     const q = specifier.indexOf("?");
     const bare = q === -1 ? specifier : specifier.slice(0, q);
     const query = q === -1 ? "" : specifier.slice(q);
     if (bare.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(bare)) {
       try { return await next(bare + ".ts" + query, context); } catch {}
     }
     return next(specifier, context);
   }`,
  import.meta.url,
);

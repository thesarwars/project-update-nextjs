import { register } from "node:module";

/**
 * Lets `node --test` follow the app's own import style.
 *
 * The source imports siblings without an extension ("./rank"), which is what tsc and
 * Next expect but not what Node's ESM resolver accepts. This hook tries the .ts file
 * before giving up, so the tests can import lib/ directly instead of keeping a parallel
 * copy of it.
 */
register(
  `data:text/javascript,
   export async function resolve(specifier, context, next) {
     if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
       try { return await next(specifier + ".ts", context); } catch {}
     }
     return next(specifier, context);
   }`,
  import.meta.url,
);

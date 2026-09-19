import { createTRPCReact } from "@trpc/react-query";

/**
 * tRPC client.
 *
 * The original TypeScript server router lived outside this folder and no longer
 * exists — the backend is the Python FastAPI app in `backend/`, which
 * re-implements the tRPC wire protocol by hand. There is therefore no generated
 * `AppRouter` type to import.
 *
 * `createTRPCReact<any>` resolves to tRPC's internal "collides with a built-in
 * method" error type, which makes every `trpc.<procedure>` access a type error,
 * so the proxy is cast once here instead of suppressing errors at each call site.
 *
 * Consequence: procedure names and their inputs/outputs are NOT type-checked.
 * A typo in a procedure name is a runtime error. Keep names in sync with
 * `dispatch_procedure()` in backend/main.py.
 */
export const trpc = createTRPCReact<any>() as any;

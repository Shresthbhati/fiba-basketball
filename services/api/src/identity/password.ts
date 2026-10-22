import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to Argon2id.
export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw);

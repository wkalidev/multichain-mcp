const LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

export type Tier = "free" | "pro" | "team";

interface LicenseResponse {
  valid: boolean;
  meta?: { variant_name?: string };
  error?: string;
}

export async function resolveTier(licenseKey: string | undefined): Promise<Tier> {
  if (!licenseKey) return "free";

  try {
    const res = await fetch(LS_VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: licenseKey }),
    });

    const data = (await res.json()) as LicenseResponse;

    if (!data.valid) {
      process.stderr.write("multichain-mcp: invalid license key, running as Free\n");
      return "free";
    }

    const variant = (data.meta?.variant_name ?? "").toLowerCase();
    if (variant.includes("team")) return "team";
    if (variant.includes("pro")) return "pro";
    return "free";
  } catch {
    process.stderr.write("multichain-mcp: could not reach license server, running as Free\n");
    return "free";
  }
}

export function tierLabel(tier: Tier): string {
  return { free: "Free", pro: "Pro", team: "Team" }[tier];
}

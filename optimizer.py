"""
Meta Ads Optimizer - Data Collection & Analysis for Ad Optimization
Blooming Nomad Digital

Collects performance metrics, audience insights, and provides
optimization recommendations for your Meta ad campaigns.
"""

from datetime import datetime, timedelta

from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from facebook_business.adobjects.adcreative import AdCreative
from facebook_business.adobjects.adsinsights import AdsInsights

import config


# ──────────────────────────────────────────────
# 1. PERFORMANCE METRICS (Insights)
# ──────────────────────────────────────────────

def get_account_insights(ad_account_id, date_preset="last_30d"):
    """
    Get overall account performance metrics.

    date_preset options: 'today', 'yesterday', 'last_7d', 'last_14d',
                         'last_30d', 'last_90d', 'this_month', 'last_month'
    """
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.cpm,
            AdsInsights.Field.spend,
            AdsInsights.Field.reach,
            AdsInsights.Field.frequency,
            AdsInsights.Field.actions,
            AdsInsights.Field.cost_per_action_type,
            AdsInsights.Field.conversions,
            AdsInsights.Field.conversion_values,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
        },
    )
    return list(insights)


def get_campaign_insights(ad_account_id, date_preset="last_30d"):
    """Get performance metrics broken down by campaign."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.campaign_id,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.cpm,
            AdsInsights.Field.spend,
            AdsInsights.Field.reach,
            AdsInsights.Field.frequency,
            AdsInsights.Field.actions,
            AdsInsights.Field.cost_per_action_type,
            AdsInsights.Field.conversions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "level": "campaign",
        },
    )
    return list(insights)


def get_adset_insights(ad_account_id, date_preset="last_30d"):
    """Get performance metrics broken down by ad set (audience/targeting)."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.adset_name,
            AdsInsights.Field.adset_id,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.cpm,
            AdsInsights.Field.spend,
            AdsInsights.Field.reach,
            AdsInsights.Field.frequency,
            AdsInsights.Field.actions,
            AdsInsights.Field.cost_per_action_type,
            AdsInsights.Field.conversions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "level": "adset",
        },
    )
    return list(insights)


def get_ad_insights(ad_account_id, date_preset="last_30d"):
    """Get performance metrics broken down by individual ad (creative)."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.adset_name,
            AdsInsights.Field.ad_name,
            AdsInsights.Field.ad_id,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.cpm,
            AdsInsights.Field.spend,
            AdsInsights.Field.reach,
            AdsInsights.Field.frequency,
            AdsInsights.Field.actions,
            AdsInsights.Field.cost_per_action_type,
            AdsInsights.Field.conversions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "level": "ad",
        },
    )
    return list(insights)


# ──────────────────────────────────────────────
# 2. DAILY BREAKDOWN (trends over time)
# ──────────────────────────────────────────────

def get_daily_insights(ad_account_id, date_preset="last_30d"):
    """Get day-by-day performance to identify trends."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.reach,
            AdsInsights.Field.actions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "time_increment": 1,  # daily breakdown
        },
    )
    return list(insights)


# ──────────────────────────────────────────────
# 3. AUDIENCE / DEMOGRAPHIC INSIGHTS
# ──────────────────────────────────────────────

def get_age_gender_insights(ad_account_id, date_preset="last_30d"):
    """Get performance broken down by age and gender."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "breakdowns": ["age", "gender"],
        },
    )
    return list(insights)


def get_platform_insights(ad_account_id, date_preset="last_30d"):
    """Get performance by platform (Facebook, Instagram, Messenger, Audience Network)."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "breakdowns": ["publisher_platform"],
        },
    )
    return list(insights)


def get_placement_insights(ad_account_id, date_preset="last_30d"):
    """Get performance by placement (Feed, Stories, Reels, etc.)."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.purchase_roas,
        ],
        params={
            "date_preset": date_preset,
            "breakdowns": ["publisher_platform", "platform_position"],
        },
    )
    return list(insights)


def get_region_insights(ad_account_id, date_preset="last_30d"):
    """Get performance by region/state."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
        ],
        params={
            "date_preset": date_preset,
            "breakdowns": ["region"],
        },
    )
    return list(insights)


def get_device_insights(ad_account_id, date_preset="last_30d"):
    """Get performance by device type (mobile, desktop, tablet)."""
    account = AdAccount(ad_account_id)
    insights = account.get_insights(
        fields=[
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.ctr,
            AdsInsights.Field.cpc,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
        ],
        params={
            "date_preset": date_preset,
            "breakdowns": ["device_platform"],
        },
    )
    return list(insights)


# ──────────────────────────────────────────────
# 4. HELPER: Extract actions/conversions
# ──────────────────────────────────────────────

def extract_actions(insight_row):
    """
    Extract key actions from an insight row into a readable dict.
    Actions include: link_click, landing_page_view, purchase,
    add_to_cart, initiate_checkout, lead, etc.
    """
    actions = insight_row.get("actions", []) or []
    costs = insight_row.get("cost_per_action_type", []) or []
    roas = insight_row.get("purchase_roas", []) or []

    result = {}
    for action in actions:
        action_type = action["action_type"]
        result[action_type] = int(action["value"])

    result["costs"] = {}
    for cost in costs:
        result["costs"][cost["action_type"]] = float(cost["value"])

    result["roas"] = None
    for r in roas:
        if r["action_type"] == "omni_purchase":
            result["roas"] = float(r["value"])

    return result


# ──────────────────────────────────────────────
# 5. OPTIMIZATION ANALYSIS
# ──────────────────────────────────────────────

def analyze_campaigns(ad_account_id, date_preset="last_30d"):
    """
    Analyze campaigns and provide optimization recommendations.
    Returns a list of recommendations.
    """
    insights = get_campaign_insights(ad_account_id, date_preset)
    recommendations = []

    for row in insights:
        name = row.get("campaign_name", "N/A")
        spend = float(row.get("spend", 0))
        impressions = int(row.get("impressions", 0))
        clicks = int(row.get("clicks", 0))
        ctr = float(row.get("ctr", 0))
        cpc = float(row.get("cpc", 0))
        frequency = float(row.get("frequency", 0))
        actions_data = extract_actions(row)

        # High frequency warning (ad fatigue)
        if frequency > 3.0:
            recommendations.append({
                "campaign": name,
                "type": "AD_FATIGUE",
                "severity": "HIGH",
                "message": f"Frequencia {frequency:.1f} esta alta. Seu publico esta vendo o anuncio muitas vezes. Renove os criativos.",
            })

        # Low CTR warning
        if ctr < 1.0 and impressions > 1000:
            recommendations.append({
                "campaign": name,
                "type": "LOW_CTR",
                "severity": "MEDIUM",
                "message": f"CTR {ctr:.2f}% esta abaixo de 1%. Teste novos criativos ou ajuste o publico-alvo.",
            })

        # High CPC warning
        if cpc > 5.0 and clicks > 10:
            recommendations.append({
                "campaign": name,
                "type": "HIGH_CPC",
                "severity": "MEDIUM",
                "message": f"CPC R${cpc:.2f} esta alto. Considere expandir o publico ou testar novos criativos.",
            })

        # No conversions warning
        purchases = actions_data.get("purchase", 0)
        if spend > 100 and purchases == 0:
            recommendations.append({
                "campaign": name,
                "type": "NO_CONVERSIONS",
                "severity": "HIGH",
                "message": f"Gastou R${spend:.2f} sem nenhuma compra. Revise o funil, publico e oferta.",
            })

        # Low ROAS warning
        roas = actions_data.get("roas")
        if roas is not None and roas < 1.0 and spend > 50:
            recommendations.append({
                "campaign": name,
                "type": "LOW_ROAS",
                "severity": "HIGH",
                "message": f"ROAS {roas:.2f}x esta negativo (abaixo de 1x). Voce esta perdendo dinheiro nesta campanha.",
            })

    return recommendations


# ──────────────────────────────────────────────
# 6. EXPORT TO CSV
# ──────────────────────────────────────────────

def export_insights_csv(insights, filename):
    """Export insights data to CSV file for analysis in Excel/Sheets."""
    import csv

    if not insights:
        print(f"  No data to export.")
        return

    # Flatten actions into columns
    rows = []
    for row in insights:
        flat = dict(row)
        actions_data = extract_actions(row)
        flat.pop("actions", None)
        flat.pop("cost_per_action_type", None)
        flat.pop("purchase_roas", None)

        for key, val in actions_data.items():
            if key == "costs":
                for cost_key, cost_val in val.items():
                    flat[f"cost_per_{cost_key}"] = cost_val
            elif key == "roas":
                flat["roas"] = val
            else:
                flat[f"action_{key}"] = val

        rows.append(flat)

    keys = set()
    for r in rows:
        keys.update(r.keys())
    keys = sorted(keys)

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Exported to {filename}")


# ──────────────────────────────────────────────
# 7. MAIN - Interactive Report
# ──────────────────────────────────────────────

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def run_optimization_report(ad_account_id, date_preset="last_30d"):
    """Run a full optimization report for the ad account."""
    FacebookAdsApi.init(access_token=config.META_ACCESS_TOKEN)

    print_section("BLOOMING NOMAD DIGITAL - RELATORIO DE OTIMIZACAO")
    print(f"  Conta: {ad_account_id}")
    print(f"  Periodo: {date_preset}")

    # ── Account Overview ──
    print_section("1. VISAO GERAL DA CONTA")
    overview = get_account_insights(ad_account_id, date_preset)
    if overview:
        row = overview[0]
        actions = extract_actions(row)
        print(f"  Impressoes:   {int(row.get('impressions', 0)):,}")
        print(f"  Alcance:      {int(row.get('reach', 0)):,}")
        print(f"  Cliques:      {int(row.get('clicks', 0)):,}")
        print(f"  CTR:          {row.get('ctr', 0)}%")
        print(f"  CPC:          R${float(row.get('cpc', 0)):.2f}")
        print(f"  CPM:          R${float(row.get('cpm', 0)):.2f}")
        print(f"  Gasto Total:  R${float(row.get('spend', 0)):.2f}")
        print(f"  Frequencia:   {row.get('frequency', 0)}")
        if actions.get("roas"):
            print(f"  ROAS:         {actions['roas']:.2f}x")
        if actions.get("purchase"):
            print(f"  Compras:      {actions['purchase']}")
        if actions.get("link_click"):
            print(f"  Link Clicks:  {actions['link_click']}")
    else:
        print("  Sem dados para o periodo selecionado.")

    # ── Campaign Performance ──
    print_section("2. PERFORMANCE POR CAMPANHA")
    camp_insights = get_campaign_insights(ad_account_id, date_preset)
    for row in camp_insights:
        actions = extract_actions(row)
        print(f"\n  Campanha: {row.get('campaign_name')}")
        print(f"    Gasto: R${float(row.get('spend', 0)):.2f}  |  "
              f"Impressoes: {int(row.get('impressions', 0)):,}  |  "
              f"Cliques: {int(row.get('clicks', 0)):,}")
        print(f"    CTR: {row.get('ctr', 0)}%  |  "
              f"CPC: R${float(row.get('cpc', 0)):.2f}  |  "
              f"Freq: {row.get('frequency', 0)}")
        if actions.get("roas"):
            print(f"    ROAS: {actions['roas']:.2f}x", end="")
        if actions.get("purchase"):
            print(f"  |  Compras: {actions['purchase']}", end="")
        print()

    # ── Age & Gender ──
    print_section("3. PERFORMANCE POR IDADE E GENERO")
    age_gender = get_age_gender_insights(ad_account_id, date_preset)
    for row in age_gender:
        print(f"  {row.get('age', '?'):>8} | {row.get('gender', '?'):>8} | "
              f"Gasto: R${float(row.get('spend', 0)):>8.2f} | "
              f"Cliques: {int(row.get('clicks', 0)):>6} | "
              f"CTR: {row.get('ctr', 0):>6}%")

    # ── Platform ──
    print_section("4. PERFORMANCE POR PLATAFORMA")
    platforms = get_platform_insights(ad_account_id, date_preset)
    for row in platforms:
        print(f"  {row.get('publisher_platform', '?'):>18} | "
              f"Gasto: R${float(row.get('spend', 0)):>8.2f} | "
              f"Cliques: {int(row.get('clicks', 0)):>6} | "
              f"CTR: {row.get('ctr', 0):>6}%")

    # ── Placement ──
    print_section("5. PERFORMANCE POR POSICIONAMENTO")
    placements = get_placement_insights(ad_account_id, date_preset)
    for row in placements:
        print(f"  {row.get('publisher_platform', '?'):>12} - "
              f"{row.get('platform_position', '?'):>20} | "
              f"Gasto: R${float(row.get('spend', 0)):>8.2f} | "
              f"CTR: {row.get('ctr', 0):>6}%")

    # ── Device ──
    print_section("6. PERFORMANCE POR DISPOSITIVO")
    devices = get_device_insights(ad_account_id, date_preset)
    for row in devices:
        print(f"  {row.get('device_platform', '?'):>12} | "
              f"Gasto: R${float(row.get('spend', 0)):>8.2f} | "
              f"Cliques: {int(row.get('clicks', 0)):>6} | "
              f"CTR: {row.get('ctr', 0):>6}%")

    # ── Optimization Recommendations ──
    print_section("7. RECOMENDACOES DE OTIMIZACAO")
    recs = analyze_campaigns(ad_account_id, date_preset)
    if recs:
        for i, rec in enumerate(recs, 1):
            severity_icon = {"HIGH": "[!!!]", "MEDIUM": "[!!]", "LOW": "[!]"}
            print(f"\n  {i}. {severity_icon.get(rec['severity'], '[!]')} {rec['type']}")
            print(f"     Campanha: {rec['campaign']}")
            print(f"     {rec['message']}")
    else:
        print("  Nenhum problema critico encontrado. Suas campanhas estao saudaveis!")

    # ── Export option ──
    print_section("8. EXPORTAR DADOS")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    export_insights_csv(camp_insights, f"campaigns_{timestamp}.csv")
    export_insights_csv(age_gender, f"age_gender_{timestamp}.csv")
    export_insights_csv(platforms, f"platforms_{timestamp}.csv")

    print(f"\n{'='*60}")
    print("  Relatorio completo!")
    print(f"{'='*60}")


if __name__ == "__main__":
    if not config.META_AD_ACCOUNT_ID:
        print("ERRO: Configure META_AD_ACCOUNT_ID no arquivo .env")
        print("Formato: act_XXXXXXXXX")
        print("\nRode 'python meta_ads.py' primeiro para ver seus IDs de conta.")
    else:
        run_optimization_report(config.META_AD_ACCOUNT_ID)

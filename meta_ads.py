"""
Meta/Facebook Ads API - Connection and Ad Account Management
Blooming Nomad Digital
"""

from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.user import User

import config


def initialize_api():
    """Initialize the Meta Ads API with credentials."""
    if not config.META_ACCESS_TOKEN:
        raise ValueError("META_ACCESS_TOKEN not found. Check your .env file.")

    FacebookAdsApi.init(access_token=config.META_ACCESS_TOKEN)
    print("Meta Ads API initialized successfully.")


def get_user_info():
    """Get the authenticated user's info and associated ad accounts."""
    me = User(fbid="me")
    my_accounts = me.get_ad_accounts(fields=[
        AdAccount.Field.name,
        AdAccount.Field.account_id,
        AdAccount.Field.account_status,
        AdAccount.Field.currency,
        AdAccount.Field.timezone_name,
    ])
    return my_accounts


def get_ad_account_details(ad_account_id):
    """Get details of a specific ad account."""
    account = AdAccount(ad_account_id)
    account_info = account.api_get(fields=[
        AdAccount.Field.name,
        AdAccount.Field.account_id,
        AdAccount.Field.account_status,
        AdAccount.Field.currency,
        AdAccount.Field.timezone_name,
        AdAccount.Field.balance,
        AdAccount.Field.amount_spent,
    ])
    return account_info


def list_campaigns(ad_account_id):
    """List all campaigns for an ad account."""
    account = AdAccount(ad_account_id)
    campaigns = account.get_campaigns(fields=[
        Campaign.Field.name,
        Campaign.Field.status,
        Campaign.Field.objective,
        Campaign.Field.daily_budget,
        Campaign.Field.lifetime_budget,
    ])
    return campaigns


def main():
    print("=" * 50)
    print("Blooming Nomad Digital - Meta Ads API")
    print("=" * 50)

    # Step 1: Initialize API
    initialize_api()

    # Step 2: Get all ad accounts linked to this token
    print("\nFetching ad accounts...")
    accounts = get_user_info()

    if not accounts:
        print("No ad accounts found for this token.")
        return

    print(f"\nFound {len(accounts)} ad account(s):\n")
    for acc in accounts:
        status_map = {1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 9: "IN_GRACE_PERIOD", 101: "PENDING_CLOSURE"}
        status = status_map.get(acc.get("account_status", 0), "UNKNOWN")
        print(f"  Account: {acc.get('name', 'N/A')}")
        print(f"  ID: act_{acc.get('account_id')}")
        print(f"  Status: {status}")
        print(f"  Currency: {acc.get('currency', 'N/A')}")
        print(f"  Timezone: {acc.get('timezone_name', 'N/A')}")
        print()

    # Step 3: If a specific ad account is configured, show details
    if config.META_AD_ACCOUNT_ID:
        print(f"\nDetails for configured account: {config.META_AD_ACCOUNT_ID}")
        print("-" * 40)
        details = get_ad_account_details(config.META_AD_ACCOUNT_ID)
        print(f"  Name: {details.get('name', 'N/A')}")
        print(f"  Balance: {details.get('balance', 'N/A')}")
        print(f"  Amount Spent: {details.get('amount_spent', 'N/A')}")

        print("\n  Campaigns:")
        campaigns = list_campaigns(config.META_AD_ACCOUNT_ID)
        if campaigns:
            for camp in campaigns:
                print(f"    - {camp.get('name')} [{camp.get('status')}] - {camp.get('objective', 'N/A')}")
        else:
            print("    No campaigns found.")
    else:
        print("TIP: Set META_AD_ACCOUNT_ID in your .env file (e.g., act_XXXXXXXXX)")
        print("     to see detailed account info and campaigns.")


if __name__ == "__main__":
    main()

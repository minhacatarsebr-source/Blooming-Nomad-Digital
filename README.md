# Blooming Nomad Digital - Meta Ads API Integration

Connect and manage your Meta/Facebook Ads account programmatically.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure your API token:**
   ```bash
   cp .env.example .env
   # Edit .env and add your Meta access token and ad account ID
   ```

3. **Run the connection script:**
   ```bash
   python meta_ads.py
   ```

## Features

- Connect to Meta Ads API with your access token
- List all ad accounts linked to your token
- View ad account details (balance, amount spent, currency)
- List campaigns with status and objectives

## Getting Your Ad Account ID

1. Go to [Facebook Business Settings](https://business.facebook.com/settings/ad-accounts)
2. Your Ad Account ID will be in the format `act_XXXXXXXXX`
3. Add it to your `.env` file as `META_AD_ACCOUNT_ID`

## Security

- **NEVER** commit your `.env` file
- The `.gitignore` is configured to exclude `.env` files
- Use `.env.example` as a template

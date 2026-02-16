provider "azurerm" {
  features {
  }
  use_cli                         = true
  use_oidc                        = false
  resource_provider_registrations = "none"
  subscription_id                 = "376a4b47-119b-40cd-88b6-c7531fa11f5c"
  environment                     = "public"
  use_msi                         = false
}

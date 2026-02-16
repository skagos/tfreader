resource "azurerm_resource_group" "res-0" {
  location = "westeurope"
  name     = "rg-cloud-copilot-dev"
}
resource "azurerm_key_vault" "res-1" {
  location            = "francecentral"
  name                = "cloudcopilotcf-kv"
  resource_group_name = azurerm_resource_group.res-0.name
  sku_name            = "standard"
  tenant_id           = "5a52ab58-42d0-4bb4-b3fc-713dd6822d20"
}
resource "azurerm_storage_account" "res-2" {
  account_replication_type        = "LRS"
  account_tier                    = "Standard"
  allow_nested_items_to_be_public = false
  location                        = "francecentral"
  name                            = "cloudcopilottoragedev"
  resource_group_name             = azurerm_resource_group.res-0.name
}
resource "azurerm_storage_account_queue_properties" "res-5" {
  storage_account_id = azurerm_storage_account.res-2.id
  hour_metrics {
    version = "1.0"
  }
  logging {
    delete  = false
    read    = false
    version = "1.0"
    write   = false
  }
  minute_metrics {
    version = "1.0"
  }
}
resource "azurerm_service_plan" "res-7" {
  location            = "francecentral"
  name                = "ASP-rgcloudcopilotdev-83cc"
  os_type             = "Linux"
  resource_group_name = azurerm_resource_group.res-0.name
  sku_name            = "B1"
}
resource "azurerm_linux_web_app" "res-8" {
  ftp_publish_basic_authentication_enabled       = false
  https_only                                     = true
  location                                       = "francecentral"
  name                                           = "cloud-copilot-api-backend"
  resource_group_name                            = azurerm_resource_group.res-0.name
  service_plan_id                                = azurerm_service_plan.res-7.id
  webdeploy_publish_basic_authentication_enabled = false
  auth_settings {
    enabled                       = false
    token_refresh_extension_hours = 0
  }
  site_config {
    always_on                         = false
    ftps_state                        = "FtpsOnly"
    ip_restriction_default_action     = ""
    scm_ip_restriction_default_action = ""
  }
}
resource "azurerm_app_service_custom_hostname_binding" "res-12" {
  app_service_name    = "cloud-copilot-api-backend"
  hostname            = "cloud-copilot-api-backend-cmd9hhbsa3g5e2aq.francecentral-01.azurewebsites.net"
  resource_group_name = azurerm_resource_group.res-0.name
  depends_on = [
    azurerm_linux_web_app.res-8,
  ]
}

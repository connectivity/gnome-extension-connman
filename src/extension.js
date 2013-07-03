 /*
  * Copyright (C) 2011 Intel Corporation. All rights reserved.
  * Author: Alok Barsode <alok.barsode@intel.com>
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 2 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>.
  */
const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext.domain('gnome-extension-connman');
const Clutter = imports.gi.Clutter;
const _ = Gettext.gettext;
const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Ext = ExtensionUtils.getCurrentExtension();
const ConnmanAgent = Ext.imports.connmanAgent;

const BLUETOOTH_APPLET = false;//imports.ui.status.bluetooth.Indicator;

const MAX_SERVICES = 7;

const BUS_NAME = 'net.connman';

let _defaultpath;

function get_technology_name(name, tethered) {
    if (name == 'Wired') {
	if (tethered)
	    return _("Wired - Sharing");
	else
	    return _("Wired");
    } else if (name == 'WiFi') {
	if (tethered)
	    return _("WiFi - Sharing");
	else
	    return _("WiFi");
    } else if (name == 'Bluetooth') {
	if (tethered)
	    return _("Bluetooth - Sharing");
	else
	    return _("Bluetooth");
    } else if (name == 'Cellular') {
	if (tethered)
	    return _("Cellular - Sharing");
	else
	    return _("Cellular");
    } else
	return name;
}

function signalToIcon(value) {
    if (value > 80)
        return 'excellent';
    if (value > 55)
        return 'good';
    if (value > 30)
        return 'ok';
    if (value > 5)
        return 'weak';
    return 'excellent';
}

function getIcon(type, strength) {
    switch (type) {
    case "ethernet":
	return 'network-wired-symbolic';
    case "cellular":
	return 'network-cellular-signal-' + signalToIcon(strength) + '-symbolic';
    case "bluetooth":
	return 'bluetooth-active-symbolic';
    case "wifi":
	return 'network-wireless-signal-' + signalToIcon(strength) + '-symbolic';
    case "vpn":
	return 'network-vpn-symbolic';
    default:
	return 'network-offline-symbolic';
    }
}

function getacquiringicon(type){
    switch (type) {
    case "wifi":
	return 'network-wireless-acquiring-symbolic';
    case "cellular":
	return 'network-cellular-acquiring-symbolic';
    case "ethernet":
	return 'network-wired-acquiring-symbolic';
    case "vpn":
	return 'network-vpn-acquiring-symbolic';
    case "bluetooth":
	return 'bluetooth-active-symbolic';
    default :
	return 'network-wireless-acquiring-symbolic';
    }
}

function getstatusIcon(type, state, strength) {
    switch(state) {
    case "online":
    case "ready":
	return getIcon(type, strength);
    case "configuration":
    case "association":
	return getacquiringicon(type);
    case "disconnect":
    case "idle":
	return 'network-offline-symbolic';
    case "failure":
    default:
	return 'network-error-symbolic';
    }
}

/*-----DBUS INTERFACE DEFINITIONS START-----*/

/* net.connman.Manager Interface */
const ManagerInterface = <interface name="net.connman.Manager">
<method name="GetProperties">
    <arg name="properties" type="a{sv}" direction="out"/>
</method>
<method name="SetProperty">
    <arg name="name" type="s" direction="in"/>
    <arg name="value" type="v" direction="in"/>
</method>
<method name="GetTechnologies">
    <arg name="technologies" type="a(oa{sv})" direction="out"/>
</method>
<method name="GetServices">
    <arg name="services" type="a(oa{sv})" direction="out"/>
</method>
<method name="RegisterAgent">
    <arg name="path" type="o" direction="in"/>
</method>
<method name="UnregisterAgent">
    <arg name="path" type="o" direction="in"/>
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
<signal name="TechnologyAdded">
    <arg name="path" type="o"/>
    <arg name="properties" type="a{sv}"/>
</signal>
<signal name="TechnologyRemoved">
    <arg name="path" type="o"/>
</signal>
<signal name="ServicesChanged">
    <arg name="changed" type="a(oa{sv})"/>
    <arg name="removed" type="ao"/>
</signal>
</interface>;

const ManagerProxy = Gio.DBusProxy.makeProxyWrapper(ManagerInterface);

function Manager() {
    return new ManagerProxy(Gio.DBus.system, BUS_NAME, '/');
}

/* net.connman.Technology Interface */
const TechnologyInterface = <interface name="net.connman.Technology">
<method name="SetProperty">
    <arg name="name" type="s" direction="in"/>
    <arg name="value" type="v" direction="in"/>
</method>
<method name="GetProperties">
    <arg name="properties" type="a{sv}" direction="out"/>
</method>
<method name="Scan">
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
</interface>;

const TechnologyProxy = Gio.DBusProxy.makeProxyWrapper(TechnologyInterface);

function Technology(path) {
    return new TechnologyProxy(Gio.DBus.system, BUS_NAME, path);
}

/* net.connman.Service Interface */
const ServiceInterface = <interface name="net.connman.Service">
<method name="SetProperty">
    <arg name="name" type="s" direction="in"/>
    <arg name="value" type="v" direction="in"/>
</method>
<method name="Connect">
</method>
<method name="Disconnect">
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
</interface>;

const Service_Proxy = Gio.DBusProxy.makeProxyWrapper(ServiceInterface);

function ServiceProxy(path) {
    return new Service_Proxy(Gio.DBus.system, BUS_NAME, path);
}

/*-----DBUS INTERFACE DEFINITIONS END-----*/

const ServiceItem = new Lang.Class({
    Name: 'Services.ServiceItem',

    _init: function(path, properties) {
	this.path = path;
	this.Item = null;

	this.proxy = new ServiceProxy(path);

	this.marked_inactive = false;

	/* For Ethernet and Hidden Wifi networks the Name property is absent. */
	if (properties.Name)
	    this.name = properties.Name.deep_unpack();
	else
	    this.name = null;

	if (properties.Type)
	    this.type = properties.Type.deep_unpack();
	else
	    this.type = null;

	if (this.name == null && this.type == 'cellular')
	    this.name = _("Cellular");
	if (this.name == null && this.type == 'ethernet')
	    this.name = _("Wired Connection");
	if (this.name == null && this.type == 'wifi') {
	    this.hidden = true;
	    this.name = _("Connect to hidden...");
	}

	if (properties.Favorite)
	    this.favorite = properties.Favorite.deep_unpack();
	else
	    this.favorite = null

	if (properties.State)
	    this.state = properties.State.deep_unpack();
	else
	    this.state = null

	if (properties.Security)
	    this.security = properties.Security.deep_unpack();
	else
	    this.security = null

	if (properties.Strength)
	    this.strength = properties.Strength.deep_unpack();
	else
	    this.strength = null;

	if (properties.Error)
	    this.error = properties.Error.deep_unpack();
	else
	    this.error = null;

	if (_defaultpath == this.path)
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));

	this.proxy.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
		if (property == 'Strength')
		    this.set_strength(value.deep_unpack());
		if (property == 'State')
		    this.set_state(value.deep_unpack());
		if (property == 'Favorite')
		    this.set_favorite(value.deep_unpack());
		if (property == 'Name')
		    this.set_name(value.deep_unpack());
		if (property == 'Error')
		    this.set_error(value.deep_unpack());
	}));
    },

    CreateMenuItem: function() {
	/* Create a Menu Item for this service. */
	this.Item = new PopupMenu.PopupBaseMenuItem();

	this.label = new St.Label();
	this.Item.addActor(this.label);
	this.set_label();

	this.state_label = new St.Label({text:""});
	this.Item.addActor(this.state_label);

	this.set_state_label();

	this._icons = new St.BoxLayout({ style_class: 'nm-menu-item-icons' });
	this.Item.addActor(this._icons, { align: St.Align.END });

	if (this.type == 'wifi' && this.security[0] != 'none') {
	    this._secureIcon = new St.Icon({ style_class: 'popup-menu-icon' });
	    if (this.security[0] == 'ieee8021x')
		this._secureIcon.icon_name = 'security-high-symbolic';
	    else if (this.security[0] == 'wep')
		this._secureIcon.icon_name = 'security-low-symbolic';
	    else
		this._secureIcon.icon_name = 'security-medium-symbolic';

	    this._icons.add_actor(this._secureIcon);
	}

	this._signalIcon = new St.Icon({ icon_name: getIcon(this.type, this.strength),
						 style_class: 'popup-menu-icon' });
	this._icons.add_actor(this._signalIcon);

	this.Item.connect('activate', Lang.bind(this, this.clicked));

	return this.Item;
    },

    clicked: function(event) {
	switch(this.state) {
	case "online":
	case "ready":
	case "configuration":
	case "association":
	    this.proxy.DisconnectRemote();
	    break;
	case "disconnect":
	case "idle":
	case "failure":
	    this.proxy.ConnectRemote();
	    break;
	}
    },

    set_label: function() {

	if (this.label == null)
	    return;

	if (this.hidden == true) {
	    this.label.clutter_text.set_markup('<i>' + this.name + '</i>');
	    return;
	}

	if (this.favorite == true) {
	    let esc_title = GLib.markup_escape_text(this.name, -1);
	    this.label.clutter_text.set_markup('<b>' + esc_title + '</b>');
	} else
	    this.label.set_text(this.name);
    },

    set_state_label: function() {

	if (this.Item == null)
	    return;

	let markup;

	switch (this.state) {
	case "online":
	    markup = '<i>' + _("Online") + '</i>';
	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(true);
	    this.connected = true;
	    break;
	case "ready":
	    markup = '<i>' + _("Connected") + '</i>';
	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(true);
	    this.connected = true;
	    break;
	case "configuration":
	    markup = '<i>' + _("Configuration...") + '</i>';
	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "association":
	    markup = '<i>' + _("Associating...") + '</i>';
	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "disconnect":
	    markup = '<i>' + _("Disconnecting...") + '</i>';
	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "idle":
	    this.state_label.text = ' ';
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "failure":
	    if (this.error != null)
		markup= '<i>' + this.error + '</i>';
	    else
		markup = '<i>' + _("Failure") + '</i>';

	    this.state_label.clutter_text.set_markup(markup);
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	default:
	    break;
	}

	this.state_label.style = 'font-size: 70%';

	if ((_defaultpath == this.path) && NetworkMenu) {
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));
	}
    },

    set_strength: function(strength) {
	this.strength = strength;

	if (this._signalIcon == null)
	    return;

	this._signalIcon.icon_name = getIcon(this.type, strength);

	if ((_defaultpath == this.path) && NetworkMenu) {
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));
	}
    },

    set_name: function(name) {
	this.name = name;
	this.set_label();
    },

    set_state: function(state) {
	this.state = state;
	this.set_state_label();

	if ((_defaultpath == this.path) && NetworkMenu)
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));

    },

    set_favorite: function(favorite) {
	this.favorite = favorite;
	this.set_label();
    },

    set_error: function(error) {
	this.error = error;
	this.set_state_label();
    },

    get_name: function() {
	if (this.hidden == true)
	    return 'Hidden Network';
	else
	    return this.name;
    },

    set_inactive: function(inactive) {
	this.marked_inactive = inactive;
        this.Item.setSensitive(!inactive);
    },

    UpdateProperties: function(properties) {
	if (properties.Strength && this.strength != properties.Strength.deep_unpack())
	    this.set_strength(properties.Strength.deep_unpack());
	if (properties.State && this.state != properties.State.deep_unpack())
	    this.set_state(properties.State.deep_unpack());
	if (properties.Favorite && this.favorite != properties.Favorite.deep_unpack())
	    this.set_favorite(properties.Favorite.value.deep_unpack());
	if (properties.Name && this.name != properties.Name.deep_unpack())
	    this.set_name(properties.Name.deep_unpack());
	if (properties.Error && this.error != properties.Error.deep_unpack())
	    this.set_error(properties.Error.deep_unpack());

	if ((_defaultpath == this.path) && NetworkMenu)
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));
    },

    check_default: function() {
	if ((_defaultpath == this.path) && NetworkMenu)
	    NetworkMenu.setIcon(getstatusIcon(this.type, this.state, this.strength));
    },

    Destroy: function() {
	if (this.Item)
	    this.Item.destroy();
    }
});

const TechnologyItem = new Lang.Class({
    Name: 'Technology.TechnologyItem',

    _init: function(path, properties) {
	this.proxy = new Technology(path);

	this.name = properties.Name.deep_unpack();
	this.powered = properties.Powered.deep_unpack();

	this.sw = new PopupMenu.PopupSwitchMenuItem("",
						    this.powered,
						    {style_class:'popup-subtitle-menu-item'});

	this.sw.label.text = get_technology_name(this.name, properties.Tethering.deep_unpack());

	this.proxy.connectSignal('PropertyChanged', Lang.bind(this, this.TechnologyPropertyChanged));

	this.sw.connect('toggled',  Lang.bind(this, function(item, state) {
	    let val = GLib.Variant.new('b', state);
	    this.proxy.SetPropertyRemote('Powered', val);
	}));
    },

    TechnologyPropertyChanged: function(proxy, sender, [property, value])
    {
	if (property == "Powered") {
	    this.powered = value.deep_unpack();

	    if (this.sw)
		this.sw.setToggleState(value.deep_unpack());
	}

	if (property == "Tethering" && this.sw)
	    this.sw.label.text = get_technology_name(this.name, value.deep_unpack());
    },

    UpdateProperties: function(properties) {
	if (properties.Powered && this.sw)
	    this.sw.setToggleState(properties.Powered.deep_unpack());

	if (properties.Tethering && this.sw)
	    this.sw.label.text = get_technology_name(this.name, properties.Tethering.deep_unpack());
    },

    Destroy: function() {
	if (this.sw) {
	    this.sw.disconnectAll();
	    this.sw.destroy();
	}
    }
});

const NetworkMenuManager = new Lang.Class({
    Name: 'NetworkMenuManager',

    Extends: PanelMenu.SystemStatusButton,

    _init: function() {
	this.parent('network-offline-symbolic', _("Network"));

	this.technologies = {};
	this.services = {};

	/* Create the extension Menu Layout.
	 * Main menu - Contains the OfflineMode switch.
	 * Tech menu - Contains the Technology switches.
	 * Service menu - Contains the services.
	 * Network Settings - Launches Network Settings.
	 */

	this._mainmenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._mainmenu);

	this.seperator1 = new PopupMenu.PopupSeparatorMenuItem();
	this.menu.addMenuItem(this.seperator1);

	this._techmenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._techmenu);

	this._servicemenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._servicemenu);

	this.seperator2 = new PopupMenu.PopupSeparatorMenuItem();
	this.menu.addMenuItem(this.seperator2);

	this._servicesubmenu = null;

	let settings = new PopupMenu.PopupBaseMenuItem();

	let label = new St.Label({text:_("Network Settings")});
	settings.addActor(label);

	settings.connect('activate', Lang.bind(this, function(){
	    Util.spawn(['gnome-control-center', 'network']);
	}));

	this.menu.addMenuItem(settings);

	this._manager = new Manager();

	this.menu.connect('open-state-changed', Lang.bind(this, this.MenuOpened));

	this._manager.RegisterAgentRemote(ConnmanAgent.PATH);

	this._manager.connectSignal('PropertyChanged', Lang.bind(this, this.ManagerPropertyChanged));
	this._manager.GetPropertiesRemote(Lang.bind(this, this.ManagerGetProperties));

	this._manager.connectSignal('TechnologyAdded', Lang.bind(this, this.ManagerTechnologyAdded));
	this._manager.connectSignal('TechnologyRemoved', Lang.bind(this, this.ManagerTechnologyRemoved));

	this._manager.GetTechnologiesRemote(Lang.bind(this, this.ManagerGetTechnologies));

	this.start_listening = false;
	this._manager.connectSignal('ServicesChanged', Lang.bind(this, this.ManagerServicesChanged));

	this._manager.GetServicesRemote(Lang.bind(this, this.ManagerGetServices));
    },

    MenuOpened: function(menu, open) {
	    this._menuopen = open;

	    if (open) {
		this.ScanNetwork();
		this._manager.GetServicesRemote(Lang.bind(this, this.CreateServiceList));
	    }
    },

    ScanNetwork: function() {
	let path = '/net/connman/technology/wifi';

	if (!Object.getOwnPropertyDescriptor(this.technologies, path))
	    return;

	let wifi = this.technologies[path];

	if (wifi.powered)
	    wifi.technology.proxy.ScanRemote();
    },

    ManagerGetProperties: function(result, exception) {
	if (!result || exception)
	    return;

	/* result contains the exported Properties.
	 * properties is a dict a{sv}. They can be accessed by
	 * properties.<Property Name>.deep_unpack() which unpacks the variant.
	*/

	let properties = result[0];
	if (!properties)
	    return;

	this.AddFlightButton(properties.OfflineMode.deep_unpack());
    },

    AddFlightButton: function(enable) {
        this.flight_switch = new PopupMenu.PopupSwitchMenuItem(_("In-Flight Mode"),
							       enable,
							       {style_class:'popup-subtitle-menu-item'});

	this.flight_switch.connect('toggled',  Lang.bind(this, function(item, state) {
	    let val = GLib.Variant.new('b', state);
	    this._manager.SetPropertyRemote('OfflineMode', val);
	}));

	this._mainmenu.addMenuItem(this.flight_switch);
    },

    ManagerPropertyChanged: function(proxy, sender, [property, value]) {
	if (property == "OfflineMode")
	    this.flight_switch.setToggleState(value.deep_unpack());
    },

    ManagerTechnologyAdded: function(proxy, sender, [path, properties]) {
	if (Object.getOwnPropertyDescriptor(this.technologies, path)) {
	    return;
	}

	if (properties.Name.deep_unpack() == 'Bluetooth' && BLUETOOTH_APPLET)
	    return;

	this.technologies[path] = {technology: new TechnologyItem(path, properties)};
	this._techmenu.addMenuItem(this.technologies[path].technology.sw);
	this._manager.GetTechnologiesRemote(Lang.bind(this, this.ManagerGetTechnologies));
    },

    ManagerTechnologyRemoved: function(proxy, sender, path) {
	if (!Object.getOwnPropertyDescriptor(this.technologies, path)) {
	    return;
	}

	this.technologies[path].technology.Destroy();
	delete this.technologies[path];

	this.menu.close();
    },

    ManagerGetTechnologies: function(result, exception) {
	/* result contains the exported Technologies.
	 * technologies is a array: a(oa{sv}), each element consists of [path, Properties]
	*/
	if (!result || exception)
	    return;

	let update = false;

	let tech_array = result[0];

	for each (let [path, properties] in tech_array) {
	    if (Object.getOwnPropertyDescriptor(this.technologies, path)) {
		this.technologies[path].technology.UpdateProperties(properties);
	    } else {
		if (properties.Name.deep_unpack() == 'Bluetooth' && BLUETOOTH_APPLET)
		    continue;

		this.technologies[path] = { technology: new TechnologyItem(path, properties)};
		update = true;
	    }

		this._techmenu.addMenuItem(this.technologies[path].technology.sw);
	};

	if (update)
	    this._manager.GetTechnologiesRemote(Lang.bind(this, this.ManagerGetTechnologies));
    },

    ManagerGetServices: function(result, exception) {
	/* result contains the exported services.
	 * services is a array: a(oa{sv}), each element consists of [path, Properties]
	*/
	if (!result || exception) {
	    this.start_listening = true;
	    return;
	}

	let serv_array = result[0];
	if (!serv_array) {
	    this.start_listening = true;
	    return;
	}
	/* if old service then update the property if new service
	create the service and add it to the service list */

	let update = false;

	for each (let [path, properties] in serv_array) {
	    if (Object.getOwnPropertyDescriptor(this.services, path))
		this.services[path].service.UpdateProperties(properties);
	    else {
		this.services[path] = { service: new ServiceItem(path, properties)};
		update = true;
		}
	}

	if (!_defaultpath) {
		let [defpath, defprop] = serv_array[0];
		_defaultpath = defpath;
	    }

	if (update) {
	    this._manager.GetServicesRemote(Lang.bind(this, this.ManagerGetServices));
	    return;
	}

	this.start_listening = true;
    },

    ManagerServicesChanged: function(proxy, sender, [changed, removed]) {
	if (!this.start_listening)
	    return;

	    for each (let path_rem in removed) {
		this.RemoveService(path_rem);
	    };

	    if (changed && changed[0]) {
		let [defpath, defprop] = changed[0];
		_defaultpath = defpath;
	    }

	    for each (let [path, properties] in changed) {
		/* if service is already present, and menu is open activate it if its inactive */
		/* if menu is closed, mark for reorder */
		if (Object.getOwnPropertyDescriptor(this.services, path)) {
		    if (this._menuopen && this.services[path].service.marked_inactive)
			this.services[path].service.set_inactive(false);
		    this.services[path].service.check_default();
		} else {
		    this.services[path] = { service: new ServiceItem(path, properties)};
		    this.AddService(this.services[path].service);
		}
	    }
    },

    AddService: function(service) {
	if (this._servicemenu.numMenuItems > MAX_SERVICES && !this._servicesubmenu) {
	    this._servicesubmenu = new PopupMenu.PopupSubMenuMenuItem(_("More..."));
	    this._servicemenu.addMenuItem(this._servicesubmenu);
	}

	if (this._servicesubmenu)
	    this._servicesubmenu.menu.addMenuItem(service.CreateMenuItem());
	else
	    this._servicemenu.addMenuItem(service.CreateMenuItem());
    },

    RemoveService: function(path) {
	if (!Object.getOwnPropertyDescriptor(this.services, path))
	    return;

	if (this._menuopen) {
	    this.services[path].service.set_inactive(true);
	} else {
	    this.services[path].service.Destroy();
	    delete this.services[path];
	}
    },

    CreateServiceList: function(result, exception) {
	/* result contains the exported services.
	 * services is a array: a(oa{sv}), each element consists of [path, Properties]
	*/

	if (!result || exception) {
	    this.start_listening = true;
	    return;
	}

	let serv_array = result[0];
	if (!serv_array) {
	    this.start_listening = true;
	    return;
	}

	/* Reorder the entire menu, as the order might have changed */
	this.ClearServiceList();

	if (serv_array.length > 0) {
	    let sep = new PopupMenu.PopupSeparatorMenuItem();
	    this._servicemenu.addMenuItem(sep);
	}

	for each (let [path, properties] in serv_array) {
	    if (Object.getOwnPropertyDescriptor(this.services, path))
		this.AddService(this.services[path].service);
	}
    },

    ClearServiceList: function() {
	if (this.services) {
	    let paths = Object.getOwnPropertyNames(this.services);
	    for each (path in paths) {
		if (this.services[path].service.marked_inactive) {
		    this.services[path].service.Destroy();
		    delete this.services[path];
		}
	    }
	}

	if (this._servicesubmenu) {
	    this._servicesubmenu.destroy();
	    this._servicesubmenu = null;
	}

	if (this._servicemenu)
	    this._servicemenu.removeAll();
    },

    Stop: function() {
	let path;
	let techs = Object.getOwnPropertyNames(this.technologies);
	for each (path in techs) {
	    this.technologies[path].technology.Destroy();
	    delete this.technologies[path];
	}

	let services = Object.getOwnPropertyNames(this.technologies);
	for each (path in services) {
	    this.services[path].service.Destroy();
	    delete this.services[path];
	}
    }
});

let NetworkMenu;
let _Watch;
let Agent;

function ConnmanAppeared() {
    if (NetworkMenu)
	return;

    Agent = new ConnmanAgent.Agent();
    NetworkMenu = new NetworkMenuManager();

    /* We don't need the icon/menu in initial setup mode */
    if (Main.sessionMode.currentMode == 'initial-setup')
      return;

    Main.panel.addToStatusArea('ConnMan', NetworkMenu);
}

function ConnmanVanished() {
    if (NetworkMenu) {
	Agent.Destroy();
	Agent = null;

	NetworkMenu.Stop();
        NetworkMenu.destroy();
	NetworkMenu = null;
    }
}

function init() {
}

function enable() {
    if (!_Watch) {
	_Watch = Gio.DBus.system.watch_name(BUS_NAME,
					    Gio.BusNameWatcherFlags.NONE,
					    ConnmanAppeared,
					    ConnmanVanished);
    }
}

function disable() {
    if (NetworkMenu) {
	Agent.Destroy();
	Agent = null;
	NetworkMenu.Stop();

	NetworkMenu.destroy();
	NetworkMenu = null;
    }

    if (_Watch) {
	Gio.DBus.system.unwatch_name(_Watch);
	_Watch = null;
    }
}

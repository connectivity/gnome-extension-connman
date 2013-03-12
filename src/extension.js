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
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const MessageTray = imports.ui.messageTray;
const CheckBox = imports.ui.checkBox;
const _ = Gettext.gettext;

const MAX_SERVICES = 7;
const AGENT_PATH = '/net/connman/agent';
const DIALOG_TIMEOUT = 120*1000;
const BUS_NAME = 'net.connman';

let _extension = null;
let _defaultpath = null;
let _agent = null;

const description_hidden_psk	= _("Passwords or encryption keys are required to access the Hidden wireless network");
const description_hidden_open	= _("Network Name is required to access the Hidden wireless network");
const description_wpa		= _("Passwords or encryption keys are required to access the wireless network ");

const security_wpa	= _("This access point is using WPA personal security.\nA passphrase of min 8 characters is required to access the network.");
const security_wep	= _("This access point is using WEP security.\nA key of 10, 26 or 58 characters is required to access the network.");
const security_enter	= _("This access point is using WPA Enterprise security.\nA passphrase is required to access the network.");
const security_wps	= _("This access point is using WPS security.\nEither push the push-button on the AP or enter a 8 digit PIN to access the network.");
const security_wispr	= _("This hotspot is using WISPr.\nA password is required to access the network.");

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
	return 'network-error-symbolic';
    }
}
/* UI PASSPHRASE DIALOG SECTION */
const PassphraseDialog = new Lang.Class({
    Name: 'PassphraseDialog',
    Extends: ModalDialog.ModalDialog,
    _init: function(ssid, fields, invocation) {
	this.parent({ styleClass: 'prompt-dialog' });
	this.invocation = invocation;
	this.fields = fields;
	this.usingWPS = false;
	/* Create the main container of the dialog */
	let mainContentBox = new St.BoxLayout({ style_class: 'prompt-dialog-main-layout', vertical: false });
        this.contentLayout.add(mainContentBox,
                               { x_fill: true,
                                 y_fill: true });

	/* Add the dialog password icon */
        let icon = new St.Icon({ icon_name: 'dialog-password-symbolic' });
        mainContentBox.add(icon,
                           { x_fill:  true,
                             y_fill:  false,
                             x_align: St.Align.END,
                             y_align: St.Align.START });

	/* Add a Message to the container */
        this.messageBox = new St.BoxLayout({ style_class: 'prompt-dialog-message-layout',
                                            vertical: true });
        mainContentBox.add(this.messageBox,
                           { y_align: St.Align.START });

	/* Add a Header Label in the Message */
        let subjectLabel = new St.Label({ style_class: 'prompt-dialog-headline',
					  text: "Authentication required by wireless network"});
        this.messageBox.add(subjectLabel,
                       { y_fill:  false,
                         y_align: St.Align.START });

	/* Add a Description Label in the Message */
        this.descriptionLabel = new St.Label({ style_class: 'prompt-dialog-description', text: "" });
        this.messageBox.add(this.descriptionLabel,{ y_fill: true, y_align: St.Align.START, expand: true });

	/* Set the description lable according to the ssid name */
	if (ssid == 'Hidden Network') {
	    if (this.fields['Passphrase'])
		this.descriptionLabel.text = description_hidden_psk;
	    else
		this.descriptionLabel.text = description_hidden_open;
	} else
	    this.descriptionLabel.text = description_wpa + ssid;

        this.descriptionLabel.style = 'height: 3em';
        this.descriptionLabel.clutter_text.line_wrap = true;

	if (this.fields['Name'])
	    this.str1 = 'Name';
	else if (this.fields['Identity'])
	    this.str1 = 'Identity';
	else if (this.fields['Username'])
	    this.str1 = 'Username';
	else
	    this.str1 = null;

	/* If Name/Username/Identity field is requested */
	if (this.str1) {
	    /* Create a box container */
            this.nameBox = new St.BoxLayout({ vertical: false });
            this.messageBox.add(this.nameBox);

	    /* Name Label */
            this.nameLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: "" }));
            this.nameBox.add(this.nameLabel, { y_fill: false, y_align: St.Align.START });

	    switch(this.str1) {
	    case 'Name':
		this.nameLabel.text = "        Name ";
		break;
	    case 'Identity':
		this.nameLabel.text = "Identity ";
		break;
	    case 'Username':
		this.nameLabel.text = "Username ";
		break;
	    };

	    /* Name Entry */
            this._nameEntry = new St.Entry({ style_class: 'prompt-dialog-password-entry', text: "",
						 can_focus: true});
            ShellEntry.addContextMenu(this._nameEntry, { isPassword: false });
            this.nameBox.add(this._nameEntry, {expand: true, y_align: St.Align.END });
	}

	if (this.fields['Passphrase'])
	    this.str2 = 'Passphrase';
	else if (this.fields['Password'])
	    this.str2 = 'Password';
	else
	    this.str2 = null;

	this.type = null;
	this.wps = null;

	if (this.str2) {
	    /* Create a box container */
            this.passphraseBox = new St.BoxLayout({ vertical: false });
	    this.messageBox.add(this.passphraseBox);

	    /* Passphrase Label */
            this.passphraseLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: ""}));
            this.passphraseBox.add(this.passphraseLabel,  { y_fill: false, y_align: St.Align.START });

	    this.set_pass_label();

	    let args = this.fields[this.str2].deep_unpack();
	    this.type = args.Type.deep_unpack();

	    /* Passphrase Entry */
            this._passphraseEntry = new St.Entry({ style_class: 'prompt-dialog-password-entry', text: "", can_focus: true });
            ShellEntry.addContextMenu(this._passphraseEntry, { isPassword: true });
            this.passphraseBox.add(this._passphraseEntry, {expand: true, y_align: St.Align.END });
	    this._passphraseEntry.clutter_text.set_password_char('\u25cf');

	    this.set_previous_pass();

	    this._passphraseEntry.clutter_text.connect('activate', Lang.bind(this, this.onOk));

	    /* Add a Security Tip */
	    this.securityLabel = new St.Label({ style_class: 'prompt-dialog-description', text: "" });
	    this.messageBox.add(this.securityLabel, { y_fill: true, y_align: St.Align.START, expand: true });

	    this.set_security_label();

	    this.securityLabel.style = 'height: 5em';
	    this.securityLabel.clutter_text.line_wrap = true;

	    this._passphraseEntry.clutter_text.connect('text-changed', Lang.bind(this, this.UpdateOK));
	}

	if (this.fields['WPS']) {
	    this.wps = new CheckBox.CheckBox();

	    let label = this.wps.getLabelActor();
	    label.text = _('Use WPS');

	    this.wps.actor.checked = false;
	    this.wps.actor.connect('clicked', Lang.bind(this, this.checkWPS));
	    this.messageBox.add(this.wps.actor);
	}

        this.okButton = { label:  _("Connect"),
                           action: Lang.bind(this, this.onOk),
                           key:    Clutter.KEY_Return,
                         };

        this.setButtons([{ label: _("Cancel"),
                           action: Lang.bind(this, this.onCancel),
                           key:    Clutter.KEY_Escape,
                         },
                         this.okButton]);

	this.open();

	if (this.str1 != null)
	    global.stage.set_key_focus(this._nameEntry);
	else
	    global.stage.set_key_focus(this._passphraseEntry);

	if (this.type)
	    this.UpdateOK();

	this.timeoutid = Mainloop.timeout_add(DIALOG_TIMEOUT, Lang.bind(this, function() {
	    this.onCancel();
	    return false;
	}));
    },

    onOk: function() {
	let retval = {};

	this.close();
	Mainloop.source_remove(this.timeoutid);

	if (this.str1)
	    retval[this.str1] = GLib.Variant.new('s', this._nameEntry.get_text());

	if (this.str2)
	    retval[this.str2] = GLib.Variant.new('s', this._passphraseEntry.get_text());

	this.invocation.return_value(GLib.Variant.new('(a{sv})', [retval]));
	this.destroy();
    },

    onCancel: function() {
	this.close();

	Mainloop.source_remove(this.timeoutid);

	this.invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');
	this.destroy();
    },

    UpdateOK: function() {
	let pass = this._passphraseEntry.get_text();
	let enable = false;

	switch (this.type) {
	case 'psk':
	    if (pass.length > 7 && pass.length < 65)
		enable = true;
	    break;
	case 'wep':
	    if (pass.length == 10 || pass.length == 26 || pass.length == 58)
		enable = true;
	    break;
	case 'response':
	case 'passphrase':
	    if (pass.length > 0)
		enable = true;
	    break;
	case 'wpspin':
	    enable = true;
	    break;
	default:
	    enable = false;
	};

	if (enable) {
	    this.okButton.button.reactive = true;
	    this.okButton.button.can_focus = true;
	    this.okButton.button.remove_style_pseudo_class('disabled');
	} else {
	    this.okButton.button.reactive = false;
	    this.okButton.button.can_focus = false;
	    this.okButton.button.add_style_pseudo_class('disabled');
	}
    },

    checkWPS: function() {
	let label = this.wps.getLabelActor();

	if (this.wps.actor.checked) {
	    label.text = _('Using WPS');

	    this.old_str2 = this.str2;
	    this.old_type = this.type;

	    this.str2 = 'WPS';
	    this.type = 'wpspin';
	} else {
	    label.text = _('Use WPS');
	    this.str2 = this.old_str2;
	    this.type = this.old_type;
	}

	this.set_pass_label();
	this.set_security_label();
	this.set_previous_pass();
	this.UpdateOK();
    },

    set_security_label: function() {
	switch(this.type) {
	case 'psk':
	    this.securityLabel.text = security_wpa;
	    break;
	case 'wep':
	    this.securityLabel.text = security_wep;
	    break;
	case 'response':
	    this.securityLabel.text = security_enter;
	    break;
	case 'passphrase':
	    if (this.str2 == 'Passphrase')
		this.securityLabel.text = security_enter;
	    else
		this.securityLabel.text = security_wispr;
	    break;
	case 'wpspin':
	    this.securityLabel.text = security_wps;
	    break;
	};
    },

    set_pass_label: function() {
	switch(this.str2) {
	case 'Passphrase':
	    this.passphraseLabel.text = "Passphrase ";
	    break;
	case 'Password':
	    this.passphraseLabel.text = " Password ";
	    break;
	case 'WPS':
	    this.passphraseLabel.text = "    WPS PIN ";
	    break;
	};
    },

    set_previous_pass: function() {
    /* If the Passphrase was already provided */
	if(this.fields['PreviousPassphrase']) {
	    let prevpass = this.fields.PreviousPassphrase.deep_unpack();
	    let prevpass_type = prevpass.Type.deep_unpack();

	    if (prevpass_type == this.type)
		this._passphraseEntry.text = prevpass.Value.deep_unpack();
	}
    },

    CleanUp: function() {
	this.close();
	Mainloop.source_remove(this.timeoutid);
	this.destroy();
    }
});
/* UI PASSPHRASE DIALOG SECTION ENDS*/

/* UI ERROR DIALOG SECTION STARTS */
const ErrorDialog = new Lang.Class({
    Name: 'ErrorDialog',
    Extends: MessageTray.Notification,

    _init: function(source, ssid, error, invocation) {
	this.parent(source,
                    _("Network"),
                    _("Connection error for %s").format(ssid),
                    { customContent: true });

        this.setResident(true);
	this.invocation = invocation;
	this.retry = false;

	this.connect('destroy', Lang.bind(this, function () {
	    if (this.retry == false)
		this.invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');
	}));

	/* Add all other errors */
	if (error == 'invalid-key') {
	    this.addBody(_("Invalid Passphrase for %s. Would you like to Retry?").format(ssid));

	    this.addButton('retry', _("Retry"));
	    this.addButton('cancel', _("Cancel"));

	    this.connect('action-invoked', Lang.bind(this, function(self, action) {
		if (action == 'retry') {
		    this.retry = true;
		    this.invocation.return_dbus_error('net.connman.Agent.Error.Retry', 'retry this service');
		}

		if (action == 'cancel') {
		    this.retry = false;
		    this.invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');
		}

		this.destroy();
            }));
	} else {
	    this.addBody(_("Unable to connect to %s").format(ssid) + _(" Error: %s").format(error));
	    this.invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');
	    this.addButton('close', _("Close"));

	    this.connect('action-invoked', Lang.bind(this, function(self, action) {
		this.retry = false;
		this.destroy();
            }));
	}
    },

    CleanUp: function() {
	this.destroy();
    }
});
/* UI ERROR DIALOG SECTION ENDS */

/* net.connman.Agent Interface */
const AgentInterface = <interface name="net.connman.Agent">
<method name="Release">
</method>
<method name="ReportError">
    <arg name="service" type="o" direction="in"/>
    <arg name="error" type="s" direction="in"/>
</method>
<method name="RequestBrowser">
    <arg name="service" type="o" direction="in"/>
    <arg name="url" type="s" direction="in"/>
</method>
<method name="RequestInput">
    <arg name="service" type="o" direction="in"/>
    <arg name="fields" type="a{sv}" direction="in"/>
    <arg name="values" type="a{sv}" direction="out"/>
</method>
<method name="Cancel">
</method>
</interface>;

const Agent = new Lang.Class({
    Name: 'Agent',
    _init: function() {
	this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(AgentInterface, this);
	this._dbusImpl.export(Gio.DBus.system, AGENT_PATH);
	this.source = null;
    },

    Release: function() {
    },

    ReportErrorAsync: function(params, invocation) {
	let [service, error] = params;
	let ssid = _extension.services[service].service.get_name();

	if (this.source == null) {
	    this.source = new MessageTray.Source(_("Network"), 'network-error');

	    this.source.connect('destroy', Lang.bind(this, function() {
		this.source = null;
            }));

	    Main.messageTray.add(this.source);
	}

	this.err_dialog = new ErrorDialog(this.source, ssid, error, invocation);
	this.source.notify(this.err_dialog);
    },

    RequestBrowser: function(service, url) {
    },

    RequestInputAsync: function(params, invocation) {
	let [service, fields] = params;
	let ssid = _extension.services[service].service.get_name();

	this.dialog = new PassphraseDialog(ssid, fields, invocation);
    },

    CancelAsync: function(params, invocation) {
	if (this.err_dialog)
	    this.err_dialog.CleanUp();

	if (this.dialog)
	    this.dialog.CleanUp();
    },

    CleanUp: function() {
	if (this.dialog)
	    this.dialog.CleanUp();

	if (this.err_dialog)
	    this.err_dialog.destroy();

	if (this.source)
	    this.source.destroy();
    }
});

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

const TechnologyItem = new Lang.Class({
    Name: 'Technology.TechnologyItem',

    _init: function(path, properties) {
	this.proxy = new TechnologyProxy(Gio.DBus.system, BUS_NAME, path);

	this.name = properties.Name.deep_unpack();

	this.sw = new PopupMenu.PopupSwitchMenuItem(null, properties.Powered.deep_unpack());
	this.set_tethering(properties.Tethering.deep_unpack());

	this.tech_sig_prop = this.proxy.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
	    if (property == "Powered")
		this.sw.setToggleState(value.deep_unpack());
	    if (property == "Tethering")
		this.set_tethering(value.deep_unpack());
	}));

	this.sw.connect('toggled',  Lang.bind(this, function(item, state) {
	    let val = GLib.Variant.new('b', state);
	    this.proxy.SetPropertyRemote('Powered', val);
	}));
    },

    set_tethering: function(tethering) {
	if (tethering)
	    this.sw.label.text = this.name + ' - sharing';
	else
	    this.sw.label.text = this.name;
    },

    UpdateProperties: function(properties) {
	if (properties.Powered)
	    this.sw.setToggleState(properties.Powered.deep_unpack());
	if (properties.Tethering)
	    this.set_tethering(properties.Tethering.deep_unpack());
    },

    CleanUp: function() {
	if (this.tech_sig_prop)
	    this.proxy.disconnectSignal(this.tech_sig_prop);
	if (this.sw)
	    this.sw.destroy();
    }
});

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

const ServiceProxy = Gio.DBusProxy.makeProxyWrapper(ServiceInterface);

const ServiceItem = new Lang.Class({
    Name: 'Services.ServiceItem',

    _init: function(path, properties) {
	this.path = path;
	this.proxy = new ServiceProxy(Gio.DBus.system, BUS_NAME, path);
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
	    this.name = 'Cellular';
	if (this.name == null && this.type == 'ethernet')
	    this.name = 'Wired Connection';
	if (this.name == null && this.type == 'wifi') {
	    this.hidden = true;
	    this.name = 'Connect to hidden...';
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
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));

	this.prop_sig = this.proxy.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
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

	this.state_label = new St.Label();
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

	if (this.favorite == true)
	    this.label.clutter_text.set_markup('<b>' + this.name + '</b>');
	else
	    this.label.clutter_text.set_markup(this.name);

	if (this.hidden == true)
	    this.label.clutter_text.set_markup('<i>' + this.name + '</i>');
    },

    set_state_label: function() {

	if (this.Item == null)
	    return;

	switch (this.state) {
	case "online":
	    this.state_label.clutter_text.set_markup('<i>' + 'Online' + '</i>');
	    this.Item.setShowDot(true);
	    this.connected = true;
	    break;
	case "ready":
	    this.state_label.clutter_text.set_markup('<i>' + 'Ready' + '</i>');
	    this.Item.setShowDot(true);
	    this.connected = true;
	    break;
	case "configuration":
	    this.state_label.clutter_text.set_markup('<i>' + 'Associating...' + '</i>');
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "association":
	    this.state_label.clutter_text.set_markup('<i>' + 'Associating...' + '</i>');
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	case "disconnect":
	    this.state_label.clutter_text.set_markup('<i>' + 'Disconnecting...' + '</i>');
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
		this.state_label.clutter_text.set_markup('<i>' + this.error + '</i>');
	    else
		this.state_label.clutter_text.set_markup('<i>' + 'Failure' + '</i>');
	    this.Item.setShowDot(false);
	    this.connected = false;
	    break;
	default:
	    break;
	}

	this.state_label.style = 'font-size: 70%';

	if (_defaultpath == this.path) {
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));
	}
    },

    set_strength: function(strength) {
	this.strength = strength;

	if (this._signalIcon == null)
	    return;

	this._signalIcon.icon_name = getIcon(this.type, strength);

	if (_defaultpath == this.path) {
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));
	}
    },

    set_name: function(name) {
	this.name = name;
	this.set_label();
    },

    set_state: function(state) {
	this.state = state;
	this.set_state_label();

	if (_defaultpath == this.path)
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));

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

	if (_defaultpath == this.path)
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));
    },

    check_default: function() {
	if (_defaultpath == this.path)
	    _extension.setIcon(getstatusIcon(this.type, this.state, this.strength));
    },

    CleanUp: function() {
	if (this.prop_sig)
	    this.proxy.disconnectSignal(this.prop_sig);
	if (this.Item)
	    this.Item.destroy();
    }
});

const ConnManager = new Lang.Class({
    Name: 'ConnManager',
    Extends: PanelMenu.SystemStatusButton,
    run: false,
    _menuopen: false,

    _init: function() {
	this.parent('network-offline-symbolic', _("Network"));
	this.ConnmanVanished();
	this.watch = Gio.DBus.system.watch_name(BUS_NAME, Gio.BusNameWatcherFlags.NONE,
						 Lang.bind(this, this.ConnmanAppeared),
						Lang.bind(this, function() {
						    this.CleanUp();
						    this.ConnmanVanished();
						}));
    },

    create_offline: function(offline) {
        this.offline_switch = new PopupMenu.PopupSwitchMenuItem("Airplane Mode", offline);

	this.offline_switch.connect('toggled',  Lang.bind(this, function(item, state) {
	let val = GLib.Variant.new('b', state);
	this._manager.SetPropertyRemote('OfflineMode', val);
	}));

	this._mainmenu.addMenuItem(this.offline_switch);
    },

    ConnmanAppeared: function() {
	this.run = true;

	if (this._noconnman)
	    this._noconnman.destroy();

	/* Create the extension Menu Layout.
	 * Main menu - Contains the OfflineMode switch.
	 * Tech menu - Contains the Technology switches.
	 * Service menu - Contains the services.
	*/
	this._mainmenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._mainmenu);

	this.seperator1 = new PopupMenu.PopupSeparatorMenuItem();
	this.menu.addMenuItem(this.seperator1);

	this._techmenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._techmenu);

	this.seperator2 = new PopupMenu.PopupSeparatorMenuItem();
	this.menu.addMenuItem(this.seperator2);

	this._servicemenu = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this._servicemenu);

	this._servicesubmenu = null;

	this._manager = new Manager();

	/* Registering the Agent */
	this._manager.RegisterAgentRemote(AGENT_PATH);

	this.technologies = {};
	this.services = {};

	/* Offlinemode Section */

	this._manager.GetPropertiesRemote(Lang.bind(this, function(result, excp) {
	/* result contains the exported Properties.
	 * properties is a dict a{sv}. They can be accessed by
	 * properties.<Property Name>.deep_unpack() which unpacks the variant.
	*/
	    let properties = result[0];
	    this.create_offline(properties.OfflineMode.deep_unpack());
	}));

	this.manager_sig_prop = this._manager.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
	    if (property == "OfflineMode")
		this.offline_switch.setToggleState(value.deep_unpack());
	}));

	/* Technology Section */

	/* We first start listening to the signals, since we can miss a Technology added or removed while we are parsing the results of GetTechnologies */
	this.manager_sig_techadd = this._manager.connectSignal('TechnologyAdded', Lang.bind(this, function(proxy, sender,[path, properties]) {
	    if (Object.getOwnPropertyDescriptor(this.technologies, path)) {
		return;
	    }

	    this.technologies[path] = {technology: new TechnologyItem(path, properties)};
	    this._techmenu.addMenuItem(this.technologies[path].technology.sw);

	}));

	this.manager_sig_techrem = this._manager.connectSignal('TechnologyRemoved', Lang.bind(this, function(proxy, sender, path) {
	    if (!Object.getOwnPropertyDescriptor(this.technologies, path)) {
		return;
	    }

	    this.technologies[path].technology.CleanUp();
	    delete this.technologies[path];
	}));

	this._manager.GetTechnologiesRemote(Lang.bind(this, this.get_technologies));

	/* Services Section */

	/* We cannot start listening to the ServiceChanged signal before GetServices,
	 *  as we might get a service whose properties are null and which can only be obtained by GetServices.
	 */

	this._manager.GetServicesRemote(Lang.bind(this, function(result, excp) {

	/* result contains the exported Services.
	 * services is a array: a(oa{sv}), each element consists of [path, Properties]
	*/
	    if (result != null) {
		let serv_array = result[0];

		if (serv_array.length != 0) {
		    let [defpath, defprop] = serv_array[0];
		    _defaultpath = defpath;

		    for each (let [path, properties] in serv_array) {
			if (!Object.getOwnPropertyDescriptor(this.services, path)) {
			    this.services[path] = { service: new ServiceItem(path, properties)};
			    this.add_service(this.services[path].service);
			}
		    };
		}
	    }
	    this.startListner();
	}));

	this.menu.connect('open-state-changed', Lang.bind(this, function(menu, open) {
	    this._menuopen = open;

	    if (!open) {
		let paths = Object.getOwnPropertyNames(this.services);
		for each (path in paths) {
		    if (this.services[path].service.marked_inactive) {
			this.services[path].service.CleanUp();
			delete this.services[path];
		    }
		}

		return;
	    }

	    this._manager.disconnectSignal(this.manager_sig_services);
	    this.manager_sig_services = null;

	    /* Reorder the entire menu, as the order might have changed */
	    if (this._servicesubmenu) {
		this._servicesubmenu.destroy();
		this._servicesubmenu = null;
	    }

	    this._servicemenu.removeAll();

	    this._manager.GetServicesRemote(Lang.bind(this, function(result, excp) {
		if (result != null) {
		    let serv_array = result[0];

		    for each (let [path, properties] in serv_array) {
			if (!Object.getOwnPropertyDescriptor(this.services, path))
			    this.services[path] = { service: new ServiceItem(path, properties)};
			this.add_service(this.services[path].service);
		    };
		}

		this.startListner();
	    }));

	    /* If the menu was opened, trigger a wifi scan.
	     * ConnMan discards wifi scan results after a timeout. */

	    let path = '/net/connman/technology/wifi';
	    if (!Object.getOwnPropertyDescriptor(this.technologies, path)) {
		return;
	    }

	    let wifi = this.technologies['/net/connman/technology/wifi'];
	    wifi.technology.proxy.ScanRemote();
	}));
    },

    get_technologies: function(result, excp) {
	/* result contains the exported Technologies.
	 * technologies is a array: a(oa{sv}), each element consists of [path, Properties]
	*/
	if (result == null)
	    return;

	let update = false;
	let tech_array = result[0];

	for each (let [path, properties] in tech_array) {
	    if (Object.getOwnPropertyDescriptor(this.technologies, path)) {
		this.technologies[path].technology.UpdateProperties(properties);
	    } else {
		this.technologies[path] = { technology: new TechnologyItem(path, properties)};
		update = true;
	    }
		this._techmenu.addMenuItem(this.technologies[path].technology.sw);
	};

	if (update)
	    this._manager.GetTechnologiesRemote(Lang.bind(this, this.get_technologies));
    },

    add_service: function(service) {
	if (this._servicemenu.numMenuItems > MAX_SERVICES && this._servicesubmenu == null) {
	    this._servicesubmenu = new PopupMenu.PopupSubMenuMenuItem(_("More..."));
	    this._servicemenu.addMenuItem(this._servicesubmenu);
	}

	if (this._servicesubmenu)
	    this._servicesubmenu.menu.addMenuItem(service.CreateMenuItem());
	else
	    this._servicemenu.addMenuItem(service.CreateMenuItem());
    },

    remove_service: function(path) {
	if (!Object.getOwnPropertyDescriptor(this.services, path))
	    return;

	if (this._menuopen) {
	    this.services[path].service.set_inactive(true);
	} else {
	    this.services[path].service.CleanUp();
	    delete this.services[path];
	}
    },

    startListner: function() {
	this.manager_sig_services = this._manager.connectSignal('ServicesChanged', Lang.bind(this, function(proxy, sender, [changed, removed]) {

	    for each (let path_rem in removed) {
		this.remove_service(path_rem);
	    };

	    if (changed != null&& changed[0] != null) {
		let [defpath, defprop] = changed[0];
		_defaultpath = defpath;
	    }

	    let update = false;

	    for each (let [path, properties] in changed) {
		/* if service is already present, and menu is open activate it if its inactive */
		/* if menu is closed, mark for reorder */
		if (Object.getOwnPropertyDescriptor(this.services, path)) {
		    if (this._menuopen && this.services[path].service.marked_inactive)
			    this.services[path].service.set_inactive(false);
		    this.services[path].service.check_default();
		} else {
		/* if service is new, and menu is open add it to the end of the menu */
		/* if menu is closed, mark for reorder */
		    update = true;
		}
	    }

	    if (update == true)
		this._manager.GetServicesRemote(Lang.bind(this, this.get_services));
	}));
    },

    get_services: function(result, excp) {
	if (result == null)
	    return;

	let serv_array = result[0];

	/* if old service then update the property if new service
	create the service and add it to the end */

	for each (let [path, properties] in serv_array) {
	    if (Object.getOwnPropertyDescriptor(this.services, path)) {
		this.services[path].service.UpdateProperties(properties);
	    } else {
		this.services[path] = { service: new ServiceItem(path, properties)};
		if (this._menuopen) {
		    this.add_service(this.services[path].service);
		}
	    }
	}
    },

    ConnmanVanished: function() {
	this.run = false;
	this._menuopen = false;
	this.setIcon('network-offline-symbolic');
	_defaultpath = null;
	this._noconnman = new PopupMenu.PopupMenuSection();
	let no_connmand = new PopupMenu.PopupMenuItem(_("Connman is not running"),
			{ reactive: false, style_class: 'popup-inactive-menu-item' });
	this._noconnman.addMenuItem(no_connmand);
	this.menu.addMenuItem(this._noconnman);
    },

    CleanUp: function() {
	if (this.run == false) {
	    if (this._noconnman)
		this._noconnman.destroy();
	    return;
	}

	/* Cleanup all the technologies, services, Agent and unwatch. */

	/*Agent Cleanup */
	if (this._manager) {
	    this._manager.UnregisterAgentRemote(AGENT_PATH);
	    _agent.CleanUp();
	}

	/* Technology cleanup */
	if (this.manager_sig_techrem && this._manager) {
	    this._manager.disconnectSignal(this.manager_sig_techrem);
	    this.manager_sig_techrem = null;
	}

	if (this.manager_sig_techadd && this._manager) {
	    this._manager.disconnectSignal(this.manager_sig_techadd);
	    this.manager_sig_techadd = null;
	}


	if (this.technologies) {
	    for each (let path in Object.keys(this.technologies)) {
		this.technologies[path].technology.CleanUp();
		delete this.technologies[path];
            }

	    delete this.technologies;
	}

	/* Services cleanup */
	if (this.manager_sig_services && this._manager) {
	    this._manager.disconnectSignal(this.manager_sig_services);
	    this.manager_sig_services = null;
	}


	if (this.services) {
	    for each (let path1 in Object.keys(this.services)) {
		this.services[path1].service.CleanUp();
		delete this.services[path1];
            }

	    delete this.services;
	}

	/* Manager cleanup */
	if (this.manager_sig_prop && this._manager) {
	    this._manager.disconnectSignal(this.manager_sig_prop);
	    this.manager_sig_prop = null;
	}

	if (this.offline_switch)
	    this.offline_switch.destroy();

	if(this._manager) {
	    delete this._manager;
	    this._manager = null;
	}

	/* Menus cleanup */
	if (this.seperator1)
	    this.seperator1.destroy();

	if (this.seperator2)
	    this.seperator2.destroy();

	if (this._mainmenu)
	    this._mainmenu.destroy();

	if (this._techmenu)
	    this._techmenu.destroy();

	if (this._servicesubmenu)
	     this._servicesubmenu.destroy();

	if (this._servicemenu)
	    this._servicemenu.destroy();

    },
})

function init() {
    //Nothing to do here.
}

function enable() {
    _agent = new Agent();

    _extension = new ConnManager();
    Main.panel.addToStatusArea('ConnMan', _extension);
}

function disable() {
    Gio.DBus.system.unwatch_name(_extension.watch);
    _extension.CleanUp();
    _extension.destroy();

    _agent._dbusImpl.unexport(Gio.DBus.system, AGENT_PATH);
    delete _agent;

    _extension = null;
    _defaultpath = null;
}

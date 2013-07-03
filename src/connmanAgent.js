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
const Gettext = imports.gettext.domain('gnome-extension-connman');
const Clutter = imports.gi.Clutter;
const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const MessageTray = imports.ui.messageTray;
const CheckBox = imports.ui.checkBox;
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Ext = ExtensionUtils.getCurrentExtension();
const Connman = Ext.imports.extension;

const PATH = '/net/connman/agent';
const DIALOG_TIMEOUT = 120*1000;

const description_hidden_psk	= _("Passwords or encryption keys are required to access the Hidden wireless network");
const description_hidden_open	= _("Network Name is required to access the Hidden wireless network");
const description_wpa		= _("Passwords or encryption keys are required to access the wireless network ");

const security_wpa   = _("This access point is using WPA personal security.\nA passphrase of min 8 characters is required to access the network.");
const security_wep   = _("This access point is using WEP security.\nA key of 10, 26 or 58 characters is required to access the network.");
const security_enter = _("This access point is using WPA Enterprise security.\nA passphrase is required to access the network.");
const security_wps   = _("This access point is using WPS security.\nEither push the push-button on the AP or enter a 8 digit PIN to access the network.");
const security_wispr = _("This hotspot is using WISPr.\nA password is required to access the network.");

function error2string(ssid, error)
{
    switch (error) {
    case 'out-of-range':
	return ('%s').format(ssid) + _(" seems to be out of range.");
    case 'pin-missing':
	return _("Missing pin information for ") + ('%s').format(ssid);
    case 'dhcp-failed':
	return _("Unable to get IP address via DHCP.");
    case 'connect-failed':
	return _("Failed to connect to") + ('%s').format(ssid);
    case 'login-failed':
	return _("Login failed");
    case 'auth-failed':
	return _("Authentication failed");
    default:
	return _("Failed to connect to ") + ('%s').format(ssid);
    };

    return _("Failed to connect to ") + ('%s').format(ssid);
};

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

let source;

const ConnmanAgentNotification = new Lang.Class({
    Name: 'ConnmanAgentNotification',
    Extends: MessageTray.Notification,

    _init: function(source, ssid, error) {
	this.parent(source,
                    _("Network"),
                    _("Network error for %s").format(ssid),
                    { customContent: true });

        this.setResident(true);
	this.setUrgency(MessageTray.Urgency.HIGH);
	let str = error2string(ssid, error);

	this.addBody(str);

	this.addButton('dismiss', _("Dismiss"));

	this.connect('action-invoked', Lang.bind(this, function(self, action) {
	    this.destroy();
        }));
    }
});

const Agent = new Lang.Class({
    Name: 'Agent',
    _init: function() {
	this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(AgentInterface, this);
	this._dbusImpl.export(Gio.DBus.system, PATH);
	source = null;
    },

    Release: function() {
	if(this.dialog)
	    this.dialog.Destroy();
	if (source)
	    source.destroy();
    },

    ReportErrorAsync: function(params, invocation) {
        let [service, error] = params;

        if (error == 'invalid-key') {
	    invocation.return_dbus_error('net.connman.Agent.Error.Retry', 'retry this service');
	    return;
	}

	invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');

        let ssid = Connman.NetworkMenu.services[service].service.get_name();

	if (!source) {
	    source = new MessageTray.Source(_("Network"), 'network-error');
	    Main.messageTray.add(source);
	}

        source.notify(new ConnmanAgentNotification(source, ssid, error));
    },

    RequestBrowser: function(service, url) {
    },

    RequestInputAsync: function(params, invocation) {
	let [service, fields] = params;
	let ssid = Connman.NetworkMenu.services[service].service.get_name();

	this.dialog = new ConnmanAgentDialog(ssid, fields, invocation);
    },

    CancelAsync: function(params, invocation) {
	if(this.dialog)
	    this.dialog.Destroy();
    },

    Destroy: function() {
	this._dbusImpl.unexport(Gio.DBus.system, PATH);

	if(this.dialog)
	    this.dialog.Destroy();

	if (source)
	    source.destroy();
    }
});

const ConnmanAgentDialog = new Lang.Class({
    Name: 'ConnmanAgentDialog',
    Extends: ModalDialog.ModalDialog,
    _init: function(ssid, fields, invocation) {
	this.parent({styleClass: 'prompt-dialog'});

	this.invocation = invocation;

	this.field1 = null;
	this.field2 = null;
 	this.field2_type = null;
	this.wps = null;
	this.prevpass = null;
	this.prevpass_type = null;

	if (fields['Name'])
	    this.field1 = 'Name';
	else if (fields['Identity'])
	    this.field1 = 'Identity';
	else if (fields['Username'])
	    this.field1 = 'Username';

	if (fields['Passphrase'])
	    this.field2 = 'Passphrase';
	else if (fields['Password'])
	    this.field2 = 'Password';

	if (this.field2) {
	    let arg = fields[this.field2].deep_unpack();
	    this.field2_type = arg.Type.unpack();
	}

	if(fields['PreviousPassphrase']) {
	    this.prevpass = fields.PreviousPassphrase.deep_unpack();
	    this.prevpass_type = prevpass.Type.deep_unpack();
	}

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
        this.descriptionLabel = new St.Label({ style_class: 'prompt-dialog-description'});
        this.messageBox.add(this.descriptionLabel, {y_fill: true, y_align: St.Align.START, expand: true });

	/* Set the description lable according to the ssid name */
	if (ssid == 'Hidden Network') {
	    if (this.fields2)
		this.descriptionLabel.set_text(description_hidden_psk);
	    else
		this.descriptionLabel.set_text(description_hidden_open);
	} else
	    this.descriptionLabel.set_text(description_wpa + ssid);

        this.descriptionLabel.style = 'height: 3em';
        this.descriptionLabel.clutter_text.line_wrap = true;

	if (this.field1) {
	    /* Create a box container */
            this.nameBox = new St.BoxLayout({ vertical: false});
            this.messageBox.add(this.nameBox);

	    /* Name Label */
            this.nameLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: "" }));
            this.nameBox.add(this.nameLabel, { y_fill: false, y_align: St.Align.START });

	    switch(this.field1) {
	    case 'Name':
		this.nameLabel.text = _("        Name ");
		break;
	    case 'Identity':
		this.nameLabel.text = _("Identity ");
		break;
	    case 'Username':
		this.nameLabel.text = _("Username ");
		break;
	    };

	    /* Name Entry */
            this._nameEntry = new St.Entry({ style_class: 'prompt-dialog-password-entry', text: "",
					     can_focus: true});
            ShellEntry.addContextMenu(this._nameEntry, { isPassword: false });
            this.nameBox.add(this._nameEntry, {expand: true, y_align: St.Align.END });

	    if (this.field2 == null)
		this._nameEntry.clutter_text.connect('activate', Lang.bind(this, this.onOk));
	}

	if (this.field2) {
	    /* Create a box container */
            this.passphraseBox = new St.BoxLayout({ vertical: false });
	    this.messageBox.add(this.passphraseBox);

	    /* Passphrase Label */
            this.passphraseLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: ""}));
            this.passphraseBox.add(this.passphraseLabel,  { y_fill: false, y_align: St.Align.START });

	    this.set_pass_label();

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

	if (fields['WPS']) {
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

	if (this.field1 != null)
	    global.stage.set_key_focus(this._nameEntry);
	else
	    global.stage.set_key_focus(this._passphraseEntry);

	if (this.field2_type)
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

	if (this.field1)
	    retval[this.field1] = GLib.Variant.new('s', this._nameEntry.get_text());

	if (this.field2)
	    retval[this.field2] = GLib.Variant.new('s', this._passphraseEntry.get_text());

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

	switch (this.field2_type) {
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

	    this.old_str2 = this.field2;
	    this.old_type = this.field2_type;

	    this.field2 = 'WPS';
	    this.field2_type = 'wpspin';
	} else {
	    label.text = _('Use WPS');
	    this.field2 = this.old_field2;
	    this.type = this.old_type;
	}

	this.set_pass_label();
	this.set_security_label();
	this.set_previous_pass();
	this.UpdateOK();
    },

    set_security_label: function() {
	switch(this.field2_type) {
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
	    if (this.field2 == 'Passphrase')
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
	switch(this.field2) {
	case 'Passphrase':
	    this.passphraseLabel.text = _("Passphrase ");
	    break;
	case 'Password':
	    this.passphraseLabel.text = _(" Password ");
	    break;
	case 'WPS':
	    this.passphraseLabel.text = _("    WPS PIN ");
	    break;
	};
    },

    set_previous_pass: function() {
	/* If the Passphrase was already provided */
	if (this.prevpass_type == this.field2_type)
	    this._passphraseEntry.text = this.prevpass.Value.deep_unpack();
    },

    Destroy: function() {
	this.invocation.return_dbus_error('net.connman.Agent.Error.Canceled', 'Cancel the connect');

	Mainloop.source_remove(this.timeoutid);
	this.destroy();
    }
});


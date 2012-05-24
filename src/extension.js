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
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const MessageTray = imports.ui.messageTray;
const _ = Gettext.gettext;

const MAX_SERVICES = 7;
const AGENT_PATH = '/net/connman/agent';
const DIALOG_TIMEOUT = 120*1000;

function signalToIcon(value) {
    if (value > 80)
        return 'excellent';
    if (value > 55)
        return 'good';
    if (value > 30)
        return 'ok';
    if (value > 5)
        return 'weak';
    return 'none';
}

function getIcon(type, strength) {
    if (type == 'ethernet')
	return 'network-wired-symbolic';
    else if (type == 'cellular')
	return 'network-cellular-signal-' + signalToIcon(strength) + '-symbolic';
    else if (type == 'bluetooth')
	return 'bluetooth-active-symbolic';
    else (type == 'wifi')
	return 'network-wireless-signal-' + signalToIcon(strength) + '-symbolic';
}

function PassphraseDialog() {
    this._init.apply(this, arguments);
}

PassphraseDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function(agent) {
        ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: 'polkit-dialog' });
	this.agent = agent;

	this.str1 = null;
	this.str2 = null;

        let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout',
                                                vertical: false });
        this.contentLayout.add(mainContentBox,
                               { x_fill: true,
                                 y_fill: true });

        let icon = new St.Icon({ icon_name: 'dialog-password-symbolic' });

        mainContentBox.add(icon,
                           { x_fill:  true,
                             y_fill:  false,
                             x_align: St.Align.END,
                             y_align: St.Align.START });

        let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout',
                                            vertical: true });
        mainContentBox.add(messageBox,
                           { y_align: St.Align.START });

        let subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline', text: "Authentication required by wireless network"});
        messageBox.add(subjectLabel,
                       { y_fill:  false,
                         y_align: St.Align.START });

        this.descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description', text: "" });

        messageBox.add(this.descriptionLabel,
                       { y_fill:  true,
                         y_align: St.Align.START,
                         expand: true });

        this.nameBox = new St.BoxLayout({ vertical: false });
        messageBox.add(this.nameBox);

        this.nameLabel = new St.Label(({ style_class: 'polkit-dialog-description', text: " " }));
        this.nameBox.add(this.nameLabel);

        this._nameEntry = new St.Entry({ style_class: 'polkit-dialog-password-entry',
						 text: "",
						 can_focus: true});
        ShellEntry.addContextMenu(this._nameEntry, { isPassword: false });
        this.nameBox.add(this._nameEntry, {expand: true });

        this.passwordBox = new St.BoxLayout({ vertical: false });
	messageBox.add(this.passwordBox);

        this.passwordLabel = new St.Label(({ style_class: 'polkit-dialog-description', text: " "}));
        this.passwordBox.add(this.passwordLabel);
        this._passwordEntry = new St.Entry({ style_class: 'polkit-dialog-password-entry',
					     text: "",
					     can_focus: true });
        ShellEntry.addContextMenu(this._passwordEntry, { isPassword: true });
        this.passwordBox.add(this._passwordEntry, {expand: true });
	this._passwordEntry.clutter_text.set_password_char('\u25cf');

        this._okButton = { label:  _("Connect"),
                           action: Lang.bind(this, this._onOk),
                           key:    Clutter.KEY_Return,
                         };

        this.setButtons([{ label: _("Cancel"),
                           action: Lang.bind(this, this.cancel),
                           key:    Clutter.KEY_Escape,
                         },
                         this._okButton]);

	this.close();
    },

    _onOk: function() {
	if (this.str1) {
	    if (this._nameEntry.get_text())
		this.agent.obj[this.str1] = this._nameEntry.get_text();
	    else
		this.agent.obj[this.str1] = '';
	}

	if (this.str2) {
	    if (this._passwordEntry.get_text())
		this.agent.obj[this.str2] = this._passwordEntry.get_text();
	    else
		this.agent.obj[this.str2] = '';
	}

	this.close();

	this.str1 = null;
	this.str2 = null;

	Mainloop.quit('agent');
    },

    cancel: function() {
	if (this.str1)
		this.agent.obj[this.str1] = '';
	if (this.str2)
		this.agent.obj[this.str2] = '';

	this.close();

	this.str1 = null;
	this.str2 = null;

	Mainloop.quit('agent');
    },

    show_dialog: function(ssid, fields) {

	this.str1 = null;
	this.str2 = null;

	this._nameEntry.text = "";
	this._passwordEntry.text = "";

	this.nameBox.hide();
	this.passwordBox.hide();

	if (ssid == 'Hidden Network') {
	    if (fields['Passphrase'])
		this.descriptionLabel.text = "Passwords or encryption keys are required to access the Hidden wireless network";
	    else
		this.descriptionLabel.text = "Network Name is required to access the Hidden wireless network";
	} else
	    this.descriptionLabel.text = "Passwords or encryption keys are required to access the wireless network "  + ssid;

        this.descriptionLabel.style = 'height: 3em';
        this.descriptionLabel.clutter_text.line_wrap = true;

	if(fields['Name']) {
	    this.nameLabel.text = '        Name ';
	    this.str1 = 'Name';
	    this.nameBox.show();
	}

	if(fields['Passphrase']) {
	    this.passwordLabel.text = 'Passphrase ';
	    this.str2 = 'Passphrase';
	    this.passwordBox.show();
	}

	this.open()
    }
};


const AgentIface = {
    name: 'net.connman.Agent',
    methods: [
        { name: 'Release', inSignature: '', outSignature: '' },
        { name: 'ReportError', inSignature: 'os', outSignature: '' },
        { name: 'RequestBrowser', inSignature: 'os', outSignature: '' },
        { name: 'RequestInput', inSignature: 'oa{sv}', outSignature: 'a{sv}' },
        { name: 'Cancel', inSignature: '', outSignature: '' }
    ]
};

function Agent() {
    this._init.apply(this, arguments);
}

Agent.prototype = {
    _init: function(connmgr) {

	this.connmgr = connmgr;
	this.dialog = new PassphraseDialog(this);
	this.timeoutid = 0;

	DBus.system.exportObject(AGENT_PATH, this);
    },

    Release: function() {
    },

    ReportError: function(service, error) {
	let source = new MessageTray.SystemNotificationSource();
	let messageTray = new MessageTray.MessageTray();
	messageTray.add(source);

	let ssid = this.connmgr.manager.get_serv_name(service);
	let content = 'Unable to connecte to ' + ssid + ' : ' + error;
	let notification = new MessageTray.Notification(source, content, null);
	notification.setTransient(true);
	source.notify(notification);
    },

    RequestBrowser: function(service, url) {
    },

    RequestInput: function(service, fields) {
	this.obj = new Object();

	let ssid = this.connmgr.manager.get_serv_name(service);

	if (this.timeoutid != 0)
	    Mainloop.source_remove(this.timeout);

	this.dialog.show_dialog(ssid, fields);

	this.timeoutid  = Mainloop.timeout_add(DIALOG_TIMEOUT, Lang.bind(this, function(){
	    if (fields['Passphrase']['Requirement'] == 'mandatory')
		this.obj.Passphrase = '';
	    if (fields['Name']['Requirement'] == 'mandatory')
		this.obj.Name = '';

	    this.dialog.close();

	    Mainloop.quit('agent');

	}));

	Mainloop.run('agent');

	Mainloop.source_remove(this.timeout);
	this.timeout = 0;

	return this.obj;
    },

    Cancel: function() {
    }
};

DBus.conformExport(Agent.prototype, AgentIface);

const ServiceIface = {
    name: 'net.connman.Service',
    methods: [
        { name: 'GetProperties', inSignature: '', outSignature: 'a{sv}' },
        { name: 'Connect', inSignature: '', outSignature: '' },
        { name: 'Disconnect', inSignature: '', outSignature: '' }
    ],
    signals: [
        { name: 'PropertyChanged', inSignature: '{sv}' }
    ]
};

function Service() {
    this._init.apply(this, arguments);
}

Service.prototype = {
    connected:false,
    _init: function(path, mgr) {
        DBus.system.proxifyObject(this, 'net.connman', path);
	this.mgr = mgr;
	this.path = path;
	this.GetPropertiesRemote(Lang.bind(this, function(result, excp) {
	    this.name  = result['Name'];
	    this.favorite = result['Favorite'];
	    this.state = result['State'];
	    this.type = result['Type'];
	    this.security = result['Security'];
	    this.strength = result['Strength'];

	    if (this.name == '' && this.type == 'cellular')
		this.name = this.type;
	    if (this.name == null && this.type == 'wifi') {
		this.hidden = true;
		this.name = 'Connect to hidden...';
	    }
	    this.connect('PropertyChanged', Lang.bind(this, function(sender, str, val) {
		if (str == 'Strength')
		    this.set_strength(val);
		if (str == 'State')
		    this.set_state(val);
		if (str == 'Favorite')
		    this.set_label(val);
		if (str == 'Name')
		    this.set_name(val);
	    }));

	    this.add_menuItem(mgr);
	}));
    },

    add_menuItem: function(mgr) {
	this.menuItem = new PopupMenu.PopupBaseMenuItem();
	this.label = new St.Label();
	this.menuItem.addActor(this.label);

	this.set_label(this.favorite);

	this._icons = new St.BoxLayout({ style_class: 'nm-menu-item-icons' });
	this.menuItem.addActor(this._icons, { align: St.Align.END });

	if (this.type == 'wifi' && this.security[0] != 'none') {
		this._secureIcon = new St.Icon({ style_class: 'popup-menu-icon' });
		this._secureIcon.icon_name = 'network-wireless-encrypted';
		this._icons.add_actor(this._secureIcon);
	    }

	this._signalIcon = new St.Icon({ icon_name: getIcon(this.type, this.strength),
						 style_class: 'popup-menu-icon' });
	this._icons.add_actor(this._signalIcon);

	this.set_state(this.state);

	this.menuItem.connect('activate', Lang.bind(this, this.clicked));

	mgr.add_service(this.menuItem);
    },

    clicked: function(event) {
	if (this.connected == false)
	    this.ConnectRemote();
	else
	    this.DisconnectRemote();
    },

    set_label: function(favorite) {
	this.favorite = favorite;
	if (favorite == true)
		this.label.clutter_text.set_markup('<b>' + this.name + '</b>');
	else
		this.label.clutter_text.set_markup(this.name);

	if (this.hidden == true)
		this.label.clutter_text.set_markup('<i>' + this.name + '</i>');
    },

    set_strength: function(strength) {
	this.strength = strength;
	this._signalIcon.icon_name = getIcon(this.type, strength);
	if (this.connected)
	    this.mgr.set_status_stregth(this.type, strength);
    },

    set_name: function(name) {
	this.name = name;
	this.set_label(this.favorite);
    },

    set_state: function(state) {
	this.state = state;

	if (state == 'online' || state == 'ready') {
	    this.menuItem.setShowDot(true);
	    this.connected = true;
	    this.mgr.autoset_status_icon();
	    return;
	}

	if (this.connected == true) {
	    this.menuItem.setShowDot(false);
	    this.connected = false;
	}

	if (state == 'association' || state == 'configuration')
	    this.mgr.set_status_config(this.type);

	if (state == 'disconnect' || state == 'failure')
	    this.mgr.autoset_status_icon();
    },

    get_path: function() {
	return this.path;
    },

    get_name: function() {
	if (this.hidden)
	    return 'Hidden Network';
	else
	    return this.name;
    },

    property_changed: function(sender, str, val) {

    },

    destroy: function() {
	this.menuItem.destroy();
    },
};

DBus.proxifyPrototype(Service.prototype, ServiceIface);

const TechnologyIface = {
    name: 'net.connman.Technology',
    methods: [
        { name: 'GetProperties', inSignature: '', outSignature: 'a{sv}' },
        { name: 'SetProperty', inSignature: 'sv', outSignature: '' },
        { name: 'Scan', inSignature: '', outSignature: '' }
    ],
    signals: [
        { name: 'PropertyChanged', inSignature: '{sv}' }
    ]
};

function Technology() {
    this._init.apply(this, arguments);
}

Technology.prototype = {

    _init: function(path, properties, mgr) {
        DBus.system.proxifyObject(this, 'net.connman', path);
	this.path = path;

	this.tech_switch = new PopupMenu.PopupSwitchMenuItem(properties['Name'], properties['Powered']);
	this.tech_switch.connect("toggled", Lang.bind(this, this.switch_toggle));

	mgr.tech_menu.addMenuItem(this.tech_switch);

	this.connect('PropertyChanged', Lang.bind(this, function(sender, str, val) {
	    if (str == "Powered")
		this.tech_switch.setToggleState(val);
	}));
    },

    destroy: function() {
	this.tech_switch.destroy();
	this.tech_switch = null;
	this.path = null;
    },

    switch_toggle: function(item, value) {
	this.SetPropertyRemote("Powered", value);
    },

    get_path: function() {
	return this.path;
    },
};

DBus.proxifyPrototype(Technology.prototype, TechnologyIface);

const ManagerIface = {
    name: 'net.connman.Manager',
    methods: [
        { name: 'GetProperties', inSignature: '', outSignature: 'a{sv}' },
        { name: 'SetProperty', inSignature: 'sv', outSignature: '' },
        { name: 'GetTechnologies', inSignature: '', outSignature: 'a(oa{sv})' },
        { name: 'GetServices', inSignature: '', outSignature: 'a(oa{sv})' },
        { name: 'RegisterAgent', inSignature: 'o', outSignature: '' },
        { name: 'UnregisterAgent', inSignature: 'o', outSignature: '' }
    ],
    signals: [
        { name: 'PropertyChanged', inSignature: '{sv}' },
        { name: 'TechnologyAdded', inSignature: 'oa{sv}' },
        { name: 'TechnologyRemoved', inSignature: 'o' },
        { name: 'ServicesChanged', inSignature: 'a(oa{sv})ao' }
    ]
};

function Manager() {
    this._init.apply(this, arguments);
}

Manager.prototype = {
    tech:[],
    services:[],

    _init: function(connmgr) {
        DBus.system.proxifyObject(this, 'net.connman', '/');
	this.connmgr = connmgr;
	this.status_icon_type = null;
	this.RegisterAgentRemote(AGENT_PATH);

	this.mgr_menu = new PopupMenu.PopupMenuSection();
	this.tech_menu = new PopupMenu.PopupMenuSection();
	this.serv_menu = new PopupMenu.PopupMenuSection();

	connmgr.menu.addMenuItem(this.mgr_menu);
	connmgr.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	connmgr.menu.addMenuItem(this.tech_menu);
	connmgr.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
	connmgr.menu.addMenuItem(this.serv_menu);

	this.GetPropertiesRemote(Lang.bind(this,
            function(result, excp) {
		if (!excp)
		    this.create_offline(result['OfflineMode']);
	}));

	this.GetTechnologiesRemote(Lang.bind(this,
            function(result, excp) {
		for each (var tech in result) {
		    this.create_technology(tech[0], tech[1]);
		};
	}));

	this.connect('TechnologyAdded', Lang.bind(this, function(sender, path, properties) {
	    this.create_technology(path, properties);
	}));

	this.connect('TechnologyRemoved', Lang.bind(this, function(sender, path) {
		this.remove_technology(path);
	}));


	this.GetServicesRemote(Lang.bind(this, function(result, excp) {
	    this.create_service(result);
	}));

	this.connect('ServicesChanged', Lang.bind(this, function(sender, added, removed) {
	    this.create_service(added);
	    for each (var path in removed)
		    this.remove_service(path);
	}));
    },

    destroy: function() {
	while(1) {
	    let obj = this.tech.pop();
	    if (obj == null)
		break;
	    obj.destroy();
	};

	while(1) {
	    let obj = this.services.pop();
	    if (obj == null)
		break;
	    obj.destroy();
	};

	this.UnregisterAgentRemote(AGENT_PATH);
	this.agent = null;
	this.tech = -1;
	this.services = -1;
	this.offline_switch.destroy();
	this.offline_switch = null;
	this.mgr_menu.destroy();
	this.mgr_menu = null;
	this.tech_menu.destroy();
	this.tech_menu = null;
	this.serv_menu.destroy();
	this.serv_menu = null;
    },

    create_offline: function(offline) {
        this.offline_switch = new PopupMenu.PopupSwitchMenuItem("Offlinemode", offline);
        this.offline_switch.connect("toggled", Lang.bind(this, this.offline_toggle));

	this.mgr_menu.addMenuItem(this.offline_switch);

	this.connect('PropertyChanged', Lang.bind(this, function(sender, property, value) {
	    if (property == "OfflineMode") {
		this.offline_switch.setToggleState(value);
	    };
	}));
    },

    offline_toggle: function(item, value) {
	this.SetPropertyRemote("OfflineMode", value);
    },

    set_status_config: function(type) {
	    if (type == 'wifi')
		this.connmgr.icon.icon_name = 'network-wireless-acquiring-symbolic';
	    if (type == 'cellular')
		this.connmgr.icon.icon_name = 'network-cellular-acquiring-symbolic';
	    if (type == 'ethernet')
		this.connmgr.icon.icon_name = 'network-wired-acquiring-symbolic';
    },

    set_status_strength: function(type, strength) {
	if (this.status_icon_type == type)
	    this.connmgr.icon.icon_name = getIcon(type, strength);
    },

    autoset_status_icon: function() {
	for (var i = 0; i < this.services.length; i++) {
	    let service  = this.services[i];
	    if (service.state == 'ready' || service.state == 'online') {
		this.status_icon_type = service.type;
		this.connmgr.icon.icon_name = getIcon(service.type, service.strength);
		return;
	    }
	}
	this.connmgr.icon.icon_name = 'network-offline-symbolic';
    },

    create_technology: function(path, properties) {
	let index = this.get_tech_index(path);
	if (index != -1)
	    return;

	let obj = new Technology(path, properties, this);
	this.tech.push(obj);
    },

    remove_technology: function(path) {
	let index = this.get_tech_index(path);
	if (index == -1)
	    return;

	let obj = this.tech[index];
	obj.destroy();
	this.tech[index] = null;
	this.tech.splice(index, 1);
    },

    get_tech_index: function(path) {
	for (var i = 0; i < this.tech.length; i++) {
	    var obj = this.tech[i];
	    if (obj.get_path() == path)
		return i;
	}
	return -1;
    },

    get_tech_path: function(path) {
	for (var i = 0; i < this.tech.length; i++) {
	    var obj = this.tech[i];
	    if (obj.get_path() == path)
		return obj;
	}
	return null;
    },

    create_service: function(services) {
	this.serv_menu.removeAll();

	if (this.serv_sub_menu) {
	    this.serv_sub_menu.menu.removeAll();
	    this.serv_sub_menu.destroy();
	    this.serv_sub_menu = null;
	}

	for each (var serv in services) {
	    for each (var item in serv) {
		if(typeof(item) == 'string') {
		    let service = this.get_service(item);
		    if (service == null) {
			service = new Service(item, this);
			this.services.push(service);
		    } else {
			service.add_menuItem(this);
		    }
		}
	    }
	}
    },

    remove_service: function(path) {
	let index = this.get_serv_index(path);
	if (index == -1)
	    return;

	let obj = this.services[index];
	obj.menuItem.destroy();
	this.services[index] = null;
	this.services.splice(index, 1);

	if(this.serv_menu.numMenuItems < MAX_SERVICES) {
	    if (this.serv_sub_menu) {
		this.serv_sub_menu.destroy();
		this.serv_sub_menu = null;
	    }
	}
    },

    get_serv_index: function(path) {
	for (var i = 0; i < this.services.length; i++) {
	    var obj = this.services[i];
	    if (obj.get_path() == path)
		return i;
	}
	return -1;
    },

    get_service: function(path) {
	for (var i = 0; i < this.services.length; i++) {
	    var obj = this.services[i];
	    if (obj.get_path() == path)
		return obj;
	}
	return null;
    },

    add_service: function(service) {
	if(this.serv_menu.numMenuItems >= MAX_SERVICES) {
	    if(this.serv_sub_menu == null) {
		this.serv_sub_menu = new PopupMenu.PopupSubMenuMenuItem(_("More..."));
		this.serv_menu.addMenuItem(this.serv_sub_menu);
	    }

	    this.serv_sub_menu.menu.addMenuItem(service);
	} else
	    this.serv_menu.addMenuItem(service);
    },

    get_serv_name: function(path) {
	for (var i = 0; i < this.services.length; i++) {
	    var obj = this.services[i];
	    if (obj.get_path() == path)
		return obj.get_name();
	}
	return null;
    },
};

DBus.proxifyPrototype(Manager.prototype, ManagerIface);

function ConnManager(metadata) {
    this._init(metadata);
}

ConnManager.prototype = {
    __proto__: PanelMenu.Button.prototype,

    run: false,
    open:false,

    _init: function(metadata) {
        PanelMenu.Button.prototype._init.call(this, 0.0);
	this.metadata = metadata;
	this.agent = new Agent(this);
        this.build_ui();
        DBus.system.watch_name('net.connman', null,
			   Lang.bind(this, this.ConnmanAppeared),
			   Lang.bind(this, this.ConnmanVanished)
        );
        this.actor.connect('button-press-event', Lang.bind(this, this.menuopen));
    },

    build_ui: function() {
        this.icon = new St.Icon({
	    icon_name: 'network-offline-symbolic',
	    style_class: "popup-menu-icon",
            icon_type: St.IconType.SYMBOLIC
        });

        this.main_icon = new St.BoxLayout();
        this.main_icon.add_actor(this.icon);

        this.actor.add_actor(this.main_icon);
	this.ConnmanVanished();
    },

    ConnmanAppeared: function() {
	if (this._mainmenu)
	    this._mainmenu.destroy();

	this.manager = new Manager(this)
    },

    ConnmanVanished: function() {
	if (this.manager) {
	    this.manager.destroy();
	    this.manager = null;
	}

	this.icon.icon_name = 'network-offline-symbolic';

	this._mainmenu = new PopupMenu.PopupMenuSection();
	let no_connmand = new PopupMenu.PopupMenuItem(_("Connman is not running"), { reactive: false, style_class: "section-title" });
	this._mainmenu.addMenuItem(no_connmand);

	this.menu.addMenuItem(this._mainmenu);
    },

    enable: function() {
        this.run = true;
        Main.panel._rightBox.insert_actor(this.actor, 0);
        Main.panel._menus.addMenu(this.menu);
    },

    disable: function() {
        this.run = false;
        Main.panel._rightBox.remove_actor(this.actor);
        Main.panel._menus.removeMenu(this.menu);
    },

    menuopen: function() {
	if (this.open == false) {
	    if (this.manager) {
		let wifi = this.manager.get_tech_path('/net/connman/technology/wifi');
		if (wifi)
		    wifi.ScanRemote();
	    }
	    this.open = true;
	} else {
	    this.open = false;
	}
    },
}

function init(metadata) {
    global.log ('running ConnManager extension');
    return new ConnManager(metadata);
}

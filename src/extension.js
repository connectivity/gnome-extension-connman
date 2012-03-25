 /*
  * Copyright (C) 2011 Intel Corporation. All rights reserved.
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
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

const _ = Gettext.gettext;

function ConnManager(metadata) {
    this._init(metadata);
}

ConnManager.prototype = {
    __proto__: PanelMenu.Button.prototype,

    run: false,

    _init: function(metadata) {
        PanelMenu.Button.prototype._init.call(this, 0.0);
        this.build_ui();
        DBus.system.watch_name('net.connman', null,
			   Lang.bind(this, this.ConnmanAppeared),
			   Lang.bind(this, this.ConnmanVanished)
        );
    },

    build_ui: function() {
        this.icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            style_class: "popup-menu-icon",
            icon_name: "network-offline"
        });

        this.main_icon = new St.BoxLayout();
        this.main_icon.add_actor(this.icon);

        this.actor.add_actor(this.main_icon);
	this.ConnmanVanished();
    },

    ConnmanAppeared: function() {
	if (this._mainmenu)
	    this._mainmenu.destroy();

	this._mainmenu = new PopupMenu.PopupMenuSection();
	let connmand = new PopupMenu.PopupMenuItem(_("Connman is running"), { reactive: false, style_class: "section-title" });
	this._mainmenu.addMenuItem(connmand);
	this.menu.addMenuItem(this._mainmenu);
    },

    ConnmanVanished: function() {
	if (this._mainmenu)
	    this._mainmenu.destroy();

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
}

function init(metadata) {
    global.log ('running ConnManager extension');
    return new ConnManager(metadata);
}

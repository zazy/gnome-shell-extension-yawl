/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 * Copyright (C) 2013 Vadim @ dbFin <vadim@dbfin.com>
 * You should have received a copy of the License along with this program.
 *
 * prefs.js
 * Extension preferences interface and stuff.
 *
 */

const Lang = imports.lang;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Convenience = Me.imports.convenience2;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new Gtk.Notebook();
    widget._settings = Convenience.getSettings();

	// Panel
	let (pagePanel = new Gtk.Grid({ margin: 7, row_spacing: 7, column_spacing: 7 }),
	     pagePanelLabel = new Gtk.Label({ label: _("Panel") })) {

		// Move central panel
		let (panelCenterLabel = new Gtk.Label({ label: _("Move central panel"), halign: Gtk.Align.START, hexpand: true }),
             panelCenterSwitch = new Gtk.Switch({ halign: Gtk.Align.END })) {
            panelCenterSwitch.set_active(widget._settings.get_boolean('move-center'));
			widget._settings.bind('move-center', panelCenterSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
            pagePanel.attach(panelCenterLabel, 0, 0, 7, 1);
            pagePanel.attach(panelCenterSwitch, 7, 0, 1, 1);
        } // let (panelCenterLabel, panelCenterSwitch)

		// Hide Activities button
		let (panelHideActivitiesLabel = new Gtk.Label({ label: _("Hide Activities button"), halign: Gtk.Align.START, hexpand: true }),
             panelHideActivitiesSwitch = new Gtk.Switch({ halign: Gtk.Align.END })) {
            panelHideActivitiesSwitch.set_active(widget._settings.get_boolean('hide-activities'));
			widget._settings.bind('hide-activities', panelHideActivitiesSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
            pagePanel.attach(panelHideActivitiesLabel, 0, 1, 7, 1);
            pagePanel.attach(panelHideActivitiesSwitch, 7, 1, 1, 1);
        } // let (panelHideActivitiesLabel, panelHideActivitiesSwitch)

		widget.append_page(/* child = */pagePanel, /* tab_label = */pagePanelLabel);
	} // let (pagePanel, pagePanelLabel)

    widget.show_all();
    return widget;
}

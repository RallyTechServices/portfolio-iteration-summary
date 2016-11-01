Ext.define("portfolio-iteration-summary", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox'},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "portfolio-iteration-summary"
    },
    launch: function() {

        CArABU.technicalservices.Utility.fetchPortfolioItemTypes().then({
            success: this.addPickers,
            failure: this.showErrorNotification,
            scope: this
        });
    },

    addPickers: function(portfolioItemTypes){
        this.portfolioItemTypes = portfolioItemTypes;
        this.logger.log('addPortfolioPicker', portfolioItemTypes,portfolioItemTypes.slice(0,2));

        this.getSelectorBox().removeAll();

        this.getSelectorBox().add({
            xtype: 'rallyartifactsearchcombobox',
            width: 500,
            labelWidth: 100,
            fieldLabel: "Portfolio Item",
            labelAlign: 'right',
            remoteFilter: true,
            storeConfig: {
                pageSize: 200,
                models: portfolioItemTypes.slice(0,2),
                context: {project: null}
            }
        });

        this.getSelectorBox().add({
            xtype:'rallyiterationcombobox',
            text: 'Iterations',
            multiSelect: true,
            valueField: 'Name'
        });

        this.getSelectorBox().add({
                xtype: 'rallybutton',
                text: 'Update',
                margin: '0 10 0 10',
                listeners: {
                    click: this.updateView,
                    scope: this
                }
            });
    },
    getSelectorBox: function(){
        return this.down('#selector_box');
    },
    getDisplayBox: function(){
        return this.down('#display_box');
    },
    getPortfolioItem: function(){
        return this.down('rallyartifactsearchcombobox') && this.down('rallyartifactsearchcombobox').getRecord() || null;
    },
    updateView: function(){

        this.getDisplayBox().removeAll();

        var pi = this.getPortfolioItem();
        this.logger.log('updateView', pi);
        if (!pi ){
            this.showNoData("Please select a portfolio item.");
            return;
        }

        var iterations = this.down('rallyiterationcombobox').getValue() || [];

        this.logger.log('updateView', pi, iterations);

        if (iterations.length > 0){
            this.fetchIterations(iterations).then({
                success: function(iterationRecords){
                    this.fetchStorySnapshots(iterationRecords, pi);
                },
                failure: this.showErrorNotification,
                scope: this
            });
        } else {
            this.fetchStorySnapshots(iterations, pi);
        }

    },
    getFeatureFieldName: function(){
        return this.portfolioItemTypes && this.portfolioItemTypes[0] && this.portfolioItemTypes[0].replace("PortfolioItem/","") || null;
    },
    getPortfolioFilter: function(pi){
        var type = pi.get('_type');
        this.logger.log('fetchStories',type);
        var idx = 0;
        Ext.Array.each(this.portfolioItemTypes, function(t){
            if (t.toLowerCase() === type){
                return false;
            }
            idx++;
        });

        var property = this.getFeatureFieldName();
        if (idx > 0){
            property = property + ".Parent";
        }
        property = property + '.ObjectID';

        return Ext.create('Rally.data.wsapi.Filter',{
            property: property ,
            value: pi.get('ObjectID')
        });
    },
    fetchIterations: function(names){
        var filters = _.map(names, function(n){ return {property: 'Name', value: n} });
        filters = Rally.data.wsapi.Filter.or(filters);

        return CArABU.technicalservices.Utility.fetchWsapiRecords({
            model: 'Iteration',
            fetch: ['Name','ObjectID','StartDate','EndDate','Project'],
            filters: filters,
            limit: 'Infinity'
        });
    },
    getStorySnapshotFetchList: function(){
        return ['ObjectID','Iteration','Release','PlanEstimate','ScheduleState','AcceptedDate','TaskEstimateTotal','TaskRemainingTotal','Project','_ValidFrom','_ValidTo'];
    },
    fetchStorySnapshots: function(iterations, pi){
        this.logger.log('fetchStorySnapshots',iterations, pi);

        var find = {
            _TypeHierarchy: 'HierarchicalRequirement',
            _ItemHierarchy: pi.get('ObjectID')
        };
        if (iterations.length > 0){
            var oids = Ext.Array.map(iterations, function(i){ return i.get('ObjectID')});
            find.Iteration = {$in: oids};
        } else {
            find.Iteration = {$ne: null};
        }

        this.setLoading(true);
        CArABU.technicalservices.Utility.fetchSnapshots({
            find: find,
            fetch: this.getStorySnapshotFetchList(),
            hydrate: ['Project', 'Iteration']
        }).then({
            success: function(snapshots){
                this.processSnapshots(snapshots, iterations, pi);
            },
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){
            this.setLoading(false);
        }, this);
    },
    processSnapshots: function(snapshots, iterations, pi){
        this.logger.log('processSnapshots', snapshots, iterations, pi);

        //Organize Snapshots by project
        var projectHash = {},
            iterationHash = {};

        Ext.Array.each(iterations || [], function(i){
            var oid = i.get('ObjectID');
            iterationHash[oid] = i.getData();
        });

        var keys = Ext.Object.getKeys(iterationHash);

        for (var i=0; i<snapshots.length; i++){

            var snap = snapshots[i].getData(),
                projectName = snap.Project.Name;

            if (!projectHash[projectName]){
                projectHash[projectName] = {snaps: []};
            }

            projectHash[projectName].snaps.push(snap);

            if (snap.Iteration){
                var iterationOid = snap.Iteration.ObjectID;
                if (Ext.Array.contains(keys, iterationOid) || keys.length === 0){
                    if (!iterationHash[iterationOid]){
                        iterationHash[iterationOid] = snap.Iteration;
                    }
                }
            }
        }

        this.logger.log('processSnapshots', projectHash, iterationHash);


        var iterationNames = [];
        Ext.Object.each(iterationHash, function(oid, obj){
            if (!Ext.Array.contains(iterationNames, obj.Name)){
                iterationNames.push(obj.Name);
            }
        });

        var data = [];
        Ext.Object.each(projectHash, function(key, obj){
            var row = {project: key},
                snaps = obj.snaps;

            Ext.Array.each(iterationNames, function(n){
                var name = this.keyify(n);
                row[name] = 0;
                Ext.Array.each(snaps, function(s){
                    if (s.Iteration && s.Iteration.Name === n){
                        row[name] += (s.PlanEstimate || 0);
                    }
                });
            }, this);
            data.push(row);
        }, this);

        this.addGrid(data, iterationNames, iterationHash);
    },
    keyify: function(key){
        return key.toString().split('.').join('x');
    },
    addGrid: function(data, iterationNames, iterationHash){

        var fields = [{name: 'project', displayName: 'Project'}];
        Ext.Array.each(iterationNames, function(n){
            var name = this.keyify(n);
            fields.push({name: name, displayName: n});
        }, this);


        this.logger.log('addGrid', data, fields);
        this.getDisplayBox().add({
            xtype: 'rallygrid',
            store: Ext.create('Rally.data.custom.Store',{
                data: data,
                fields: fields,
                pageSize: data.length
            }),
            margin: '25 0 0 0',
            columnCfgs: this.getColumnCfgs(fields),
           // pageSize: data.length,
            showPagingToolbar: false,
            showRowActionsColumn: false
        });
    },


    getColumnCfgs: function(fields){

        var cols = [{
            dataIndex: 'project',
            text: 'Project',
            flex: 2
        }];
        Ext.Array.each(fields, function(f){
            if (f.name !== 'project'){
                cols.push({
                    dataIndex: f.name,
                    text: f.displayName,
                    flex: 1
                });
            }
        });
        this.logger.log('getColumnCfgs', cols);
        return cols;
    },
    showErrorNotification: function(msg){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    showNoData: function(msg){

        if (!msg){
            msg = 'No data found for the selected item.';
        }

        this.getDisplayBox().add({
            xtype: 'container',
            html: '<div class="no-data-container"><div class="secondary-message">' + msg + '</div></div>'
        });
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});

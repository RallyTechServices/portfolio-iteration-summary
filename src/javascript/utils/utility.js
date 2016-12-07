Ext.define('CArABU.technicalservices.Utility',{
    singleton: true,

    fetchSnapshots: function(config){
        var deferred = Ext.create('Deft.Deferred');

        config.removeUnauthorizedSnapshots = true;
        config.limit = 'Infinity';

        Ext.create('Rally.data.lookback.SnapshotStore', config).load({
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error fetching snapshots:  ' + error_msg);
                }
            }
        });
        return deferred;
    },

    fetchWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');

        config.pageSize = 2000;

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback: function(records, operation, success){
                if (success){
                    deferred.resolve(records);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error fetching records:  ' + error_msg);
                }
            }
        });
        return deferred;
    },

    fetchPortfolioItemTypes: function(context){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            context: context,
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }         
            ],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        }).load({
            callback: function(records, operation, success){
                if (success){
                    var types = Ext.Array.map(records, function(r){ return r.get('TypePath'); });

                    deferred.resolve(types);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
    }
});
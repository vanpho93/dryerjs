import {
    GraphQLObjectType,
    GraphQLInputObjectType,
    GraphQLNonNull,
    GraphQLString,
    GraphQLFloat,
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLInt,
    GraphQLList,
} from 'graphql';
import { ModelDefinition } from './type';
import { MetadataKey, TraversedProperty, inspect } from './metadata';

const enumTypeCached = {};

abstract class BaseTypeBuilder {
    constructor(protected modelDefinition: ModelDefinition) {}

    protected abstract getName(): string;
    protected abstract isExcludedField(traversedProperty: TraversedProperty): boolean;
    protected abstract isNullableField(traversedProperty: TraversedProperty): boolean;
    protected abstract useAs: 'input' | 'output';

    public getType() {
        const result = {
            name: this.getName(),
            fields: {},
        };

        inspect(this.modelDefinition)
            .getProperties()
            .forEach(traversedProperty => {
                if (this.isExcludedField(traversedProperty)) return;
                const isNullable = this.isNullableField(traversedProperty);
                const type = this.getTypeForOneField(traversedProperty, isNullable);
                result.fields[traversedProperty.name] = { type };
            });

        if (this.useAs === 'input') return new GraphQLInputObjectType(result);
        if (this.useAs === 'output') return new GraphQLObjectType(result);
        /* istanbul ignore next */
        throw new Error('Invalid useAs');
    }

    private getTypeForOneField(traversedProperty: TraversedProperty, nullable: boolean) {
        const baseType = this.getBaseTypeForField(traversedProperty);
        return nullable ? baseType : new GraphQLNonNull(baseType);
    }

    private getBaseTypeForField(traversedProperty: TraversedProperty) {
        const overrideType = traversedProperty.getMetadataValue(MetadataKey.GraphQLType);
        if (overrideType) return overrideType;

        const typeConfig = {
            String: GraphQLString,
            Date: GraphQLString,
            Number: GraphQLFloat,
            Boolean: GraphQLBoolean,
        };
        const enumInObject = traversedProperty.getMetadataValue(MetadataKey.Enum);
        if (enumInObject) {
            const enumName = Object.keys(enumInObject)[0];
            const enumValues = enumInObject[enumName];

            enumTypeCached[enumName] =
                enumTypeCached[enumName] ??
                new GraphQLEnumType({
                    name: enumName,
                    values: Object.keys(enumValues).reduce((values, key) => {
                        values[key] = { value: enumValues[key] };
                        return values;
                    }, {}),
                });

            return enumTypeCached[enumName];
        }

        const scalarBaseType = typeConfig[traversedProperty.typeInClass.name];
        if (scalarBaseType) return scalarBaseType;

        const isEmbedded = traversedProperty.getMetadataValue(MetadataKey.Embedded);
        if (isEmbedded) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return new this.constructor(traversedProperty.typeInClass).getType();
        }

        throw new Error(
            `Invalid type for field ${traversedProperty.name}. You can override it with @GraphQLType(/* type */)`,
        );
    }
}

class OutputTypeBuilder extends BaseTypeBuilder {
    protected getName() {
        return this.modelDefinition.name;
    }

    protected isExcludedField(traversedProperty: TraversedProperty) {
        return traversedProperty.getMetadataValue(MetadataKey.ExcludeOnOutput);
    }

    protected isNullableField(traversedProperty: TraversedProperty) {
        return traversedProperty.getMetadataValue(MetadataKey.NullableOnOutput);
    }

    protected useAs: 'input' | 'output' = 'output';
}

class CreateInputTypeBuilder extends BaseTypeBuilder {
    protected getName() {
        return `Create${this.modelDefinition.name}Input`;
    }

    protected isExcludedField(traversedProperty: TraversedProperty) {
        return traversedProperty.getMetadataValue(MetadataKey.ExcludeOnCreate);
    }

    protected isNullableField(traversedProperty: TraversedProperty) {
        return !traversedProperty.getMetadataValue(MetadataKey.RequiredOnCreate);
    }

    protected useAs: 'input' | 'output' = 'input';
}

class UpdateInputTypeBuilder extends BaseTypeBuilder {
    protected getName() {
        return `Update${this.modelDefinition.name}Input`;
    }

    protected isExcludedField(traversedProperty: TraversedProperty) {
        return traversedProperty.getMetadataValue(MetadataKey.ExcludeOnUpdate);
    }

    protected isNullableField(traversedProperty: TraversedProperty) {
        return !traversedProperty.getMetadataValue(MetadataKey.RequiredOnUpdate);
    }

    protected useAs: 'input' | 'output' = 'input';
}

export class GraphqlTypeBuilder {
    static build(modelDefinition: ModelDefinition) {
        const output = new OutputTypeBuilder(modelDefinition).getType() as GraphQLObjectType;
        const create = new CreateInputTypeBuilder(modelDefinition).getType() as GraphQLInputObjectType;
        const update = new UpdateInputTypeBuilder(modelDefinition).getType() as GraphQLInputObjectType;
        const nonNullOutput = new GraphQLNonNull(output);
        return {
            output,
            nonNullOutput,
            create,
            update,
            paginationOutput: this.getPaginationOutputType(modelDefinition, nonNullOutput),
        };
    }

    private static getPaginationOutputType(
        modelDefinition: ModelDefinition,
        nonNullOutput: GraphQLNonNull<GraphQLObjectType<ModelDefinition, any>>,
    ) {
        const result = {
            name: `${modelDefinition.name}Pagination`,
            fields: {
                docs: { type: new GraphQLList(nonNullOutput) },
                totalDocs: { type: GraphQLInt },
                page: { type: GraphQLInt },
                limit: { type: GraphQLInt },
                hasPrevPage: { type: GraphQLBoolean },
                hasNextPage: { type: GraphQLBoolean },
                totalPages: { type: GraphQLInt },
            },
        };
        return new GraphQLObjectType(result);
    }
}

import { Injector } from 'injection-js';
import * as graphql from 'graphql';
import * as util from '../util';
import { Model } from '../model';
import { Context } from '../dryer';
import { NonPrimitiveArrayKeyOf, UnwrapArray } from '../shared';
import { GetService } from './get';
import { UpdateService } from './update';

interface EmbeddedModelInput<T, K extends NonPrimitiveArrayKeyOf<T>, Context> {
    parentId: string;
    context: Context;
    model: Model<T>;
    propertyName: K;
}

export class EmbeddedModelService<T, K extends NonPrimitiveArrayKeyOf<T>, ExtraContext> {
    constructor(
        private embeddedModelInput: EmbeddedModelInput<T, K, Context<ExtraContext>>,
        private readonly injector: Injector,
    ) {}

    private async getObjects(): Promise<UnwrapArray<T[K]>[]> {
        const { parentId, context, model, propertyName } = this.embeddedModelInput;
        const parent = await this.injector
            .get(GetService<T, ExtraContext>)
            .getOrThrow(parentId, context, model);
        return parent[propertyName] as any;
    }

    public async create(input: Partial<UnwrapArray<T[K]>>): Promise<UnwrapArray<T[K]>> {
        const objects = await this.getObjects();
        const { propertyName, parentId, model, context } = this.embeddedModelInput;
        const updatedParent = await this.injector
            .get(UpdateService<T, ExtraContext>)
            .update(parentId, { [propertyName]: [...objects, input] } as any, context, model);
        return util.last(updatedParent[propertyName] as any);
    }

    public async update(id: string, input: Partial<UnwrapArray<T[K]>>): Promise<UnwrapArray<T[K]>> {
        const objects = await this.getObjects();
        const embedded = this.findByIdOrThrow(objects, id);
        const { propertyName, parentId, model, context } = this.embeddedModelInput;

        const newArrayOfEmbeddedObjects = objects.map((item: any) => {
            if (item.id === id) {
                return { ...(embedded as object), ...input };
            }
            return item;
        });
        const updatedParent = await this.injector
            .get(UpdateService<T, ExtraContext>)
            .update(parentId, { [propertyName]: newArrayOfEmbeddedObjects } as any, context, model);

        return updatedParent[propertyName as any].find((item: any) => item.id === id);
    }

    public async delete(id: string) {
        const { propertyName, parentId, model, context } = this.embeddedModelInput;
        const objects = await this.getObjects();
        this.findByIdOrThrow(objects, id);
        const newArrayOfEmbeddedObjects = objects.filter((item: any) => {
            return item.id !== id;
        });
        await this.injector
            .get(UpdateService<T, ExtraContext>)
            .update(parentId, { [propertyName]: newArrayOfEmbeddedObjects } as any, context, model);
        return { deleted: true, id };
    }

    private findByIdOrThrow(objects: UnwrapArray<T[K]>[], id: string) {
        const embedded = objects.find((item: any) => item.id === id);
        if (util.isNil(embedded)) {
            const { propertyName, parentId, model } = this.embeddedModelInput;
            const idKey = `${util.toCamelCase(model.name)}Id`;
            throw new graphql.GraphQLError(
                `No ${util.singular(propertyName as string)} found with id ${id} with ${idKey} ${parentId}`,
                {
                    extensions: {
                        code: 'NOT_FOUND',
                        http: { status: 404 },
                    },
                },
            );
        }
        return embedded;
    }

    public async getOrThrow(id: string): Promise<UnwrapArray<T[K]>> {
        const objects = await this.getObjects();
        return this.findByIdOrThrow(objects, id);
    }

    public async getAll() {
        return await this.getObjects();
    }
}

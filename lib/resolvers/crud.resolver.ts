import * as graphql from 'graphql';
import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { PaginateModel } from 'mongoose';
import { InjectModel, getModelToken } from '@nestjs/mongoose';
import { Provider, ValidationPipe } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import * as util from '../util';
import { Definition } from '../shared';
import { Typer } from '../typer';
import { SuccessResponse } from '../types';
import { inspect } from '../inspect';
import { appendIdAndTransform } from './shared';
import { plainToInstance } from 'class-transformer';

export function createResolver(definition: Definition): Provider {
  @Resolver()
  class GeneratedResolver<T> {
    constructor(
      @InjectModel(definition.name) public model: PaginateModel<any>,
      public moduleRef: ModuleRef,
    ) {}

    @Mutation(() => Typer.for(definition).output)
    async [`create${definition.name}`](
      @Args(
        'input',
        { type: () => Typer.for(definition).create },
        new ValidationPipe({
          transform: true,
          expectedType: Typer.for(definition).create,
        }),
      )
      input: any,
    ) {
      const created = await this.model.create(input);
      for (const property of inspect(definition).referencesManyProperties) {
        if (!input[property.name] || input[property.name].length === 0) continue;
        const relation = property.getReferencesMany();
        const relationDefinition = relation.fn();
        const newIds: string[] = [];
        for (const subObject of input[property.name]) {
          const relationModel = this.moduleRef.get(getModelToken(relationDefinition.name), { strict: false });
          const createdRelation = await relationModel.create(subObject);
          newIds.push(createdRelation._id);
        }
        await this.model.findByIdAndUpdate(created._id, {
          $addToSet: { [relation.options.from]: { $each: newIds } },
        });
      }
      return appendIdAndTransform(definition, await this.model.findById(created._id));
    }

    @Mutation(() => Typer.for(definition).output)
    async [`update${definition.name}`](
      @Args(
        'input',
        { type: () => Typer.for(definition).update },
        new ValidationPipe({
          transform: true,
          expectedType: Typer.for(definition).update,
        }),
      )
      input: any,
    ) {
      const updated = await this.model.findOneAndUpdate({ _id: input.id }, input);
      if (util.isNil(updated))
        throw new graphql.GraphQLError(`No ${definition.name} found with ID: ${input.id}`);
      return appendIdAndTransform(definition, await this.model.findById(updated._id));
    }

    @Query(() => Typer.for(definition).output)
    async [definition.name.toLowerCase()](
      @Args('id', { type: () => graphql.GraphQLID }) id: string,
    ): Promise<T> {
      const result = await this.model.findById(id);
      if (util.isNil(result)) throw new graphql.GraphQLError(`No ${definition.name} found with ID: ${id}`);
      return appendIdAndTransform(definition, result) as any;
    }

    @Query(() => [Typer.for(definition).output])
    async [`all${util.plural(definition.name)}`](): Promise<T[]> {
      const items = await this.model.find({});
      return items.map((item) => appendIdAndTransform(definition, item)) as any;
    }

    @Mutation(() => SuccessResponse)
    async [`remove${definition.name}`](@Args('id', { type: () => graphql.GraphQLID }) id: string) {
      const removed = await this.model.findByIdAndRemove(id);
      if (util.isNil(removed)) throw new graphql.GraphQLError(`No ${definition.name} found with ID: ${id}`);
      return { success: true };
    }

    @Query(() => Typer.for(definition).paginate)
    async [`paginate${util.plural(definition.name)}`]() {
      const { docs, totalDocs, totalPages, page } = await this.model.paginate({}, { page: 1, limit: 10 });
      return plainToInstance(Typer.for(definition).paginate, {
        docs: docs.map((doc) => appendIdAndTransform(definition, doc)),
        totalDocs,
        page,
        totalPages,
      });
    }
  }

  return GeneratedResolver as any;
}

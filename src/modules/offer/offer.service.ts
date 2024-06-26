import { DocumentType, types } from '@typegoose/typegoose';
import { inject, injectable } from 'inversify';
import { AppComponent } from '../../types/app-component.enum.js';
import { LoggerInterface } from '../../core/logger/logger.interface.js';
import { OfferServiceInterface } from './offer-service.interface.js';
import { OfferEntity } from './offer.entity.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import { UpdateOfferDto } from './dto/update-offer.dto.js';
import { DEFAULT_OFFER_COUNT } from './offer.constants.js';
import { SortType } from '../../types/sort.type.js';

@injectable()
export class OfferService implements OfferServiceInterface {
  constructor(
    @inject(AppComponent.LoggerInterface) private readonly logger: LoggerInterface,
    @inject(AppComponent.OfferModel) private readonly offerModel: types.ModelType<OfferEntity>,
  ) {}

  public async create(dto: CreateOfferDto): Promise<DocumentType<OfferEntity>> {
    const result = await this.offerModel.create(dto);
    this.logger.info('New offer created');

    return result;
  }

  public async exists(documentId: string): Promise<boolean> {
    return (await this.offerModel.exists({ _id: documentId })) !== null;
  }

  public async findPremiumByCity(city: string): Promise<DocumentType<OfferEntity>[]> {
    return await this.offerModel
      .aggregate([
        {
          $match: {
            city: {
              $regex: city,
              $options: 'i',
            },
            premium: {
              $eq: true,
            },
          },
        },
        {
          $lookup: {
            from: 'comments',
            let: {
              offerId: '$_id',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$$offerId', '$offerId'],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  rating: 1,
                },
              },
            ],
            as: 'comments',
          },
        },
        {
          $addFields: {
            rating: {
              $avg: '$comments.rating',
            },
          },
        },
        {
          $unset: 'comments',
        },
      ])
      .exec();
  }

  public async findById(id: string): Promise<DocumentType<OfferEntity> | null> {
    const offer = await this.offerModel.findById(id).exec();

    if (!offer) {
      return null;
    }

    return offer;
  }

  public async deleteById(id: string): Promise<DocumentType<OfferEntity> | null> {
    const result = await this.offerModel.findByIdAndDelete(id).exec();

    this.logger.info(`Offer ${result?.id} deleted`);

    return result;
  }

  public async updateById(id: string, dto: UpdateOfferDto): Promise<DocumentType<OfferEntity> | null> {
    const result = await this.offerModel.findByIdAndUpdate(id, dto, { new: true }).populate(['userId']).exec();

    const updatedOffer = await this.findById(id);

    this.logger.info(`Offer ${result?.id} updated`);

    return updatedOffer;
  }

  public async findOffersList(favoriteList: string[], count?: number): Promise<DocumentType<OfferEntity>[]> {
    const limit = count ?? DEFAULT_OFFER_COUNT;

    return await this.offerModel
      .aggregate([
        {
          $lookup: {
            from: 'comments',
            let: {
              offerId: '$_id',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$$offerId', '$offerId'],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  rating: 1,
                },
              },
            ],
            as: 'comments',
          },
        },
        {
          $addFields: {
            rating: {
              $avg: '$comments.rating',
            },
          },
        },
        {
          $unset: 'comments',
        },
        {
          $addFields: {
            favorite: {
              $cond: {
                if: {
                  $in: ['$_id', favoriteList],
                },
                then: true,
                else: false,
              },
            },
          },
        },
      ])
      .sort({ createdAt: SortType.Down })
      .limit(limit)
      .exec();
  }
}
